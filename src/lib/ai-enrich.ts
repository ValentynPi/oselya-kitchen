import {
  DRINK_SUBGROUPS,
  RECIPE_GROUPS,
  guessAisle,
  suggestCategoryName,
  suggestDrinkSubgroup,
  suggestMealTypes,
} from "@/lib/ai";
import type { ExtractedRecipe } from "@/lib/extract";
import { completeJson, isAiConfigured } from "@/lib/llm";
import type { Ingredient, MealType, RecipeStep, StoreAisle } from "@/lib/types";

export type AiEnrichedRecipe = ExtractedRecipe & {
  categoryName?: string;
  subcategoryName?: string;
  mealTypes?: MealType[];
  aiUsed?: boolean;
};

type AiRecipePayload = {
  title?: string;
  description?: string;
  cookTimeMinutes?: number;
  servings?: number;
  categoryName?: string;
  subcategoryName?: string | null;
  mealTypes?: string[];
  ingredients?: Array<{
    name?: string;
    amount?: number;
    unit?: string;
  }>;
  steps?: Array<{ order?: number; text?: string }>;
  warnings?: string[];
};

const MEAL_SET = new Set<MealType>(["breakfast", "lunch", "dinner", "snack"]);
const GROUP_SET = new Set<string>(RECIPE_GROUPS);
const DRINK_SET = new Set<string>(DRINK_SUBGROUPS);

const PLACEHOLDER_STEP =
  /доповніть кроки|перевірте джерело|відкрийте джерело|виконайте кроки приготування|опишіть кроки/i;

function systemPrompt(): string {
  return [
    "Ти — редактор сімейної кулінарної книги «Оселя».",
    "Твоє завдання: уважно перевірити чернетку рецепта і виправити її українською.",
    "Думай як досвідчений кухар і редактор контенту, не як парсер.",
    "",
    "Обов'язково:",
    "1) Прибери з інгредієнтів метадані (складність, час, «розробка», «відпочинок», заголовки «як приготувати…»).",
    "2) Залиш лише реальні продукти з розумними amount/unit/name українською.",
    "3) Переклади сенс (Agua/Агуа → Вода, Sal/Сал → Сіль), ніколи не транслітеруй латиницю в кирилицю.",
    "4) Кроки мають бути справжніми інструкціями приготування, не плейсхолдерами.",
    "5) Якщо кроки порожні/сміття, віднови їх з контексту назви/опису/інгредієнтів, якщо це можливо; інакше залиш короткий чесний крок.",
    "6) Обери рівно одну categoryName з дозволеного списку.",
    "7) Для «Напої» можна вказати subcategoryName з підгруп; інакше null.",
    "8) mealTypes — підмножина breakfast|lunch|dinner|snack.",
    "9) Відповідай ЛИШЕ валідним JSON без markdown.",
  ].join("\n");
}

function userPrompt(recipe: ExtractedRecipe): string {
  const draft = {
    title: recipe.title,
    description: recipe.description,
    sourceUrl: recipe.sourceUrl,
    host: recipe.host,
    cookTimeMinutes: recipe.cookTimeMinutes,
    servings: recipe.servings,
    ingredients: recipe.ingredients.map((i) => ({
      name: i.name,
      amount: i.amount,
      unit: i.unit,
    })),
    steps: recipe.steps.map((s) => ({ order: s.order, text: s.text })),
    allowedCategories: [...RECIPE_GROUPS],
    allowedDrinkSubgroups: [...DRINK_SUBGROUPS],
    allowedMealTypes: ["breakfast", "lunch", "dinner", "snack"],
  };

  return [
    "Ось чернетка після автоімпорту. Виправ і структуруй.",
    "Поверни JSON форми:",
    JSON.stringify(
      {
        title: "string",
        description: "string",
        cookTimeMinutes: 30,
        servings: 4,
        categoryName: "Супи",
        subcategoryName: null,
        mealTypes: ["lunch", "dinner"],
        ingredients: [{ name: "Помідори", amount: 1000, unit: "г" }],
        steps: [{ order: 1, text: "..." }],
        warnings: ["optional string"],
      },
      null,
      2,
    ),
    "",
    "Чернетка:",
    JSON.stringify(draft, null, 2),
  ].join("\n");
}

function cleanIngredients(raw: AiRecipePayload["ingredients"]): Ingredient[] {
  if (!Array.isArray(raw)) return [];
  const out: Ingredient[] = [];
  for (const item of raw) {
    const name = String(item?.name || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!name || name.length < 2 || name.length > 120) continue;
    if (
      /складність|загальний час|розробка|відпочинок|як приготувати|difficulty|prep time|total time/i.test(
        name,
      )
    ) {
      continue;
    }
    const amountRaw = Number(item?.amount);
    const amount = Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : 1;
    const unit = String(item?.unit || "").trim().slice(0, 24);
    const aisle: StoreAisle = guessAisle(name);
    out.push({ name, amount, unit, aisle });
    if (out.length >= 40) break;
  }
  return out;
}

function cleanSteps(raw: AiRecipePayload["steps"]): RecipeStep[] {
  if (!Array.isArray(raw)) return [];
  const out: RecipeStep[] = [];
  for (const step of raw) {
    const text = String(step?.text || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text || text.length < 8 || text.length > 1200) continue;
    if (PLACEHOLDER_STEP.test(text)) continue;
    out.push({ order: out.length + 1, text });
    if (out.length >= 40) break;
  }
  return out;
}

function pickCategory(raw: string | undefined, fallback: ExtractedRecipe): string {
  const name = String(raw || "").trim();
  if (GROUP_SET.has(name)) return name;
  return suggestCategoryName({
    title: fallback.title,
    description: fallback.description,
    ingredients: fallback.ingredients,
    steps: fallback.steps,
    cookTimeMinutes: fallback.cookTimeMinutes,
  });
}

function pickDrinkSub(
  categoryName: string,
  raw: string | null | undefined,
  fallback: ExtractedRecipe,
): string | undefined {
  if (categoryName !== "Напої") return undefined;
  const name = String(raw || "").trim();
  if (DRINK_SET.has(name)) return name;
  return suggestDrinkSubgroup({
    title: fallback.title,
    description: fallback.description,
    ingredients: fallback.ingredients,
  });
}

function pickMeals(raw: string[] | undefined, categoryName: string): MealType[] {
  const fromAi = (raw || [])
    .map((m) => String(m).toLowerCase().trim())
    .filter((m): m is MealType => MEAL_SET.has(m as MealType));
  if (fromAi.length > 0) return Array.from(new Set(fromAi));
  return suggestMealTypes(categoryName, ["dinner"]);
}

/**
 * Ask ChatGPT to think through a scraped/parsed recipe draft.
 * Falls back to heuristics when AI is off or fails.
 */
export async function enrichRecipeWithAi(
  recipe: ExtractedRecipe,
): Promise<AiEnrichedRecipe> {
  if (!isAiConfigured()) {
    const categoryName = suggestCategoryName({
      title: recipe.title,
      description: recipe.description,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      cookTimeMinutes: recipe.cookTimeMinutes,
    });
    return {
      ...recipe,
      categoryName,
      subcategoryName: pickDrinkSub(categoryName, null, recipe),
      mealTypes: suggestMealTypes(categoryName, ["dinner"]),
      aiUsed: false,
      warnings: [
        ...recipe.warnings,
        "ШІ не налаштовано (додайте OPENAI_API_KEY) — використано евристику.",
      ],
    };
  }

  const payload = await completeJson<AiRecipePayload>(
    systemPrompt(),
    userPrompt(recipe),
  );

  if (!payload) {
    const categoryName = suggestCategoryName({
      title: recipe.title,
      description: recipe.description,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      cookTimeMinutes: recipe.cookTimeMinutes,
    });
    return {
      ...recipe,
      categoryName,
      subcategoryName: pickDrinkSub(categoryName, null, recipe),
      mealTypes: suggestMealTypes(categoryName, ["dinner"]),
      aiUsed: false,
      warnings: [
        ...recipe.warnings,
        "ШІ тимчасово недоступний — використано евристику.",
      ],
    };
  }

  const title = String(payload.title || recipe.title).trim().slice(0, 160) || recipe.title;
  const description =
    String(payload.description || recipe.description).trim().slice(0, 800) ||
    recipe.description;

  const ingredients = cleanIngredients(payload.ingredients);
  const steps = cleanSteps(payload.steps);

  const mergedIngredients =
    ingredients.length >= 2 ? ingredients : recipe.ingredients;
  const mergedSteps = steps.length >= 1 ? steps : recipe.steps;

  const categoryName = pickCategory(payload.categoryName, {
    ...recipe,
    title,
    description,
    ingredients: mergedIngredients,
    steps: mergedSteps,
  });
  const subcategoryName = pickDrinkSub(
    categoryName,
    payload.subcategoryName,
    { ...recipe, title, description, ingredients: mergedIngredients },
  );
  const mealTypes = pickMeals(payload.mealTypes, categoryName);

  const cookTimeMinutes =
    typeof payload.cookTimeMinutes === "number" && payload.cookTimeMinutes > 0
      ? Math.round(payload.cookTimeMinutes)
      : recipe.cookTimeMinutes;
  const servings =
    typeof payload.servings === "number" && payload.servings > 0
      ? Math.round(payload.servings)
      : recipe.servings;

  const aiWarnings = Array.isArray(payload.warnings)
    ? payload.warnings.map(String).filter(Boolean).slice(0, 5)
    : [];

  return {
    ...recipe,
    title,
    description,
    cookTimeMinutes,
    servings,
    ingredients: mergedIngredients,
    steps: mergedSteps,
    categoryName,
    subcategoryName,
    mealTypes,
    aiUsed: true,
    warnings: Array.from(
      new Set([...recipe.warnings, ...aiWarnings, "Оброблено ШІ (ChatGPT)."]),
    ),
  };
}

/** Server-side category suggestion that prefers ChatGPT when available. */
export async function suggestCategoryWithAi(
  recipe: Pick<
    ExtractedRecipe,
    "title" | "description" | "ingredients" | "steps" | "cookTimeMinutes"
  >,
): Promise<string> {
  if (!isAiConfigured()) {
    return suggestCategoryName(recipe);
  }

  const payload = await completeJson<{ categoryName?: string }>(
    "Ти класифікуєш рецепти для української сімейної кухні. Відповідай лише JSON.",
    [
      `Дозволені категорії: ${RECIPE_GROUPS.join(", ")}.`,
      "Поверни {\"categoryName\":\"...\"}.",
      `Назва: ${recipe.title}`,
      `Опис: ${recipe.description}`,
      `Інгредієнти: ${recipe.ingredients.map((i) => i.name).join(", ")}`,
    ].join("\n"),
  );

  const name = String(payload?.categoryName || "").trim();
  if (GROUP_SET.has(name)) return name;
  return suggestCategoryName(recipe);
}
