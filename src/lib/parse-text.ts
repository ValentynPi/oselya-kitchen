import { guessAisle } from "@/lib/ai";
import type { Ingredient, RecipeStep } from "@/lib/types";
import type { ExtractedRecipe } from "@/lib/extract";

function parseIngredientLine(line: string): Ingredient {
  const cleaned = line.replace(/^[-•*–—]\s*/, "").replace(/^\d+[.)]\s*/, "").trim();
  const match = cleaned.match(/^([\d.,/½¼¾⅓⅔]+)\s*([а-яА-Яa-zA-Z.]+)?\s+(.+)$/);
  if (match) {
    const amount = Number(match[1].replace(",", ".")) || 1;
    const unit = match[2] || "шт";
    const name = match[3].trim();
    return { name, amount, unit, aisle: guessAisle(name) };
  }

  const dash = cleaned.split(/\s+[—–-]\s+/);
  if (dash.length >= 2) {
    const name = dash[0].trim();
    const rest = dash.slice(1).join(" ").trim();
    const m = rest.match(/^([\d.,]+)\s*(.*)$/);
    return {
      name,
      amount: m ? Number(m[1].replace(",", ".")) || 1 : 1,
      unit: m?.[2]?.trim() || "шт",
      aisle: guessAisle(name),
    };
  }

  return { name: cleaned || "Інгредієнт", amount: 1, unit: "шт", aisle: guessAisle(cleaned) };
}

const ING_HEADERS =
  /^(інгредієнти|ингредиенты|склад|продукти|products|ingredients|що потрібно|вам знадобиться)\b/i;
const STEP_HEADERS =
  /^(приготування|спосіб приготування|інструкція|інструкції|кроки|рецепт|preparation|directions|method|instructions|steps|як готувати)\b/i;
const DESC_HEADERS = /^(опис|about|description|нотатки|notes)\b/i;

function looksLikeIngredient(line: string): boolean {
  if (line.length < 2 || line.length > 120) return false;
  if (STEP_HEADERS.test(line) || ING_HEADERS.test(line) || DESC_HEADERS.test(line)) return false;
  if (
    /\b(click here|read more|newsletter|facebook|instagram|pinterest|subscribe|advertisement|related recipe)\b/i.test(
      line,
    )
  ) {
    return false;
  }
  const words = line.split(/\s+/).length;
  if (words > 14 && /[.!?].*[a-zа-я]/i.test(line)) return false;
  return (
    /^\d/.test(line) ||
    /[—–-]/.test(line) ||
    /\d\s*(г|кг|мл|л|шт|ч\.?\s*л|ст\.?\s*л|cup|tsp|tbsp|oz|lb)\b/i.test(line) ||
    /^[-•*]/.test(line) ||
    (words <= 5 && !/[.!?]/.test(line))
  );
}

function looksLikeStep(line: string): boolean {
  if (line.length < 8) return false;
  if (ING_HEADERS.test(line) || STEP_HEADERS.test(line)) return false;
  return /^\d+[.)]\s+/.test(line) || /^(крок\s*\d+|step\s*\d+)/i.test(line) || line.length > 40;
}

function extractTime(text: string): number {
  const m =
    text.match(/(\d+)\s*(?:хв|хвилин|min(?:utes)?)\b/i) ||
    text.match(/час[:\s]+(\d+)/i) ||
    text.match(/cook(?:ing)? time[:\s]+(\d+)/i);
  if (m) return Math.max(1, Number(m[1]));
  const hours = text.match(/(\d+)\s*(?:год|hours?|hrs?)\b/i);
  if (hours) return Math.max(1, Number(hours[1]) * 60);
  return 30;
}

function extractServings(text: string): number {
  const m =
    text.match(/(\d+)\s*(?:порц(?:ії|ій)?|servings?|persons?|people|чел)\b/i) ||
    text.match(/(?:на|for)\s+(\d+)/i);
  return m ? Math.max(1, Number(m[1])) : 4;
}

/** Turn pasted freeform recipe text into a structured draft. */
export function parseRecipeFromText(raw: string): ExtractedRecipe {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) {
    throw new Error("Вставте текст рецепта");
  }

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const warnings: string[] = [];
  let title = lines[0]?.slice(0, 120) || "Рецепт з тексту";
  let mode: "scan" | "ingredients" | "steps" | "description" = "scan";
  const ingredientLines: string[] = [];
  const stepLines: string[] = [];
  const descriptionLines: string[] = [];
  let skippedTitle = false;

  for (const line of lines) {
    if (!skippedTitle && line === lines[0] && line.length < 100 && !looksLikeIngredient(line)) {
      skippedTitle = true;
      continue;
    }

    if (ING_HEADERS.test(line.replace(/[:：]\s*$/, ""))) {
      mode = "ingredients";
      continue;
    }
    if (STEP_HEADERS.test(line.replace(/[:：]\s*$/, ""))) {
      mode = "steps";
      continue;
    }
    if (DESC_HEADERS.test(line.replace(/[:：]\s*$/, ""))) {
      mode = "description";
      continue;
    }

    if (mode === "ingredients") {
      if (looksLikeStep(line) && !looksLikeIngredient(line)) {
        mode = "steps";
        stepLines.push(line.replace(/^\d+[.)]\s*/, "").replace(/^(крок|step)\s*\d+[:.\s]*/i, ""));
      } else {
        ingredientLines.push(line);
      }
      continue;
    }

    if (mode === "steps") {
      stepLines.push(line.replace(/^\d+[.)]\s*/, "").replace(/^(крок|step)\s*\d+[:.\s]*/i, ""));
      continue;
    }

    if (mode === "description") {
      descriptionLines.push(line);
      continue;
    }

    // scan mode — auto-detect
    if (looksLikeIngredient(line)) {
      mode = "ingredients";
      ingredientLines.push(line);
    } else if (looksLikeStep(line)) {
      mode = "steps";
      stepLines.push(line.replace(/^\d+[.)]\s*/, ""));
    } else if (descriptionLines.length < 3 && line.length > 20) {
      descriptionLines.push(line);
    }
  }

  // Fallback: if nothing structured, split body after title
  if (ingredientLines.length === 0 && stepLines.length === 0) {
    const body = lines.slice(1);
    const mid = Math.max(1, Math.ceil(body.length / 2));
    for (const line of body.slice(0, mid)) {
      if (line !== title) ingredientLines.push(line);
    }
    for (const line of body.slice(mid)) {
      stepLines.push(line);
    }
    warnings.push(
      "Структуру визначено приблизно. Перевірте інгредієнти та кроки перед збереженням.",
    );
  } else if (ingredientLines.length === 0) {
    warnings.push("Інгредієнти не знайдено автоматично — додайте їх у редакторі.");
  } else if (stepLines.length === 0) {
    warnings.push("Кроки не знайдено автоматично — додайте їх у редакторі.");
  }

  const ingredients: Ingredient[] =
    ingredientLines.length > 0
      ? ingredientLines.map(parseIngredientLine)
      : [{ name: "Додайте інгредієнти", amount: 1, unit: "порція", aisle: "other" }];

  const steps: RecipeStep[] =
    stepLines.length > 0
      ? stepLines.map((text, i) => ({ order: i + 1, text: text.trim() })).filter((s) => s.text)
      : [{ order: 1, text: "Опишіть кроки приготування." }];

  // If first "title" looks like an ingredient, invent a title
  if (looksLikeIngredient(title) || ING_HEADERS.test(title) || STEP_HEADERS.test(title)) {
    title = "Рецепт з тексту";
    warnings.push("Назву визначено автоматично — можете змінити.");
  }

  return {
    title,
    description:
      descriptionLines.join(" ").slice(0, 400) ||
      "Створено з вставленого тексту. Перевірте картку перед збереженням.",
    sourceUrl: "",
    imageUrl:
      "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=1200&q=80",
    cookTimeMinutes: extractTime(text),
    servings: extractServings(text),
    ingredients,
    steps,
    host: "text",
    warnings,
  };
}
