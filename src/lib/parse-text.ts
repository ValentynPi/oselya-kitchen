import { smartParseIngredient } from "@/lib/ingredients";
import type { Ingredient, RecipeStep } from "@/lib/types";
import type { ExtractedRecipe } from "@/lib/extract";

function parseIngredientLine(line: string): Ingredient {
  return smartParseIngredient(line);
}

const ING_HEADERS =
  /^(?:\u0456нгред\u0456\u0454нти|ингредиенты|склад|продукти|products|ingredients|що потр\u0456бно|вам знадобиться)(?=\s|$|[:：])/iu;
const STEP_HEADERS =
  /^(?:приготування|спос\u0456б приготування|\u0456нструкц\u0456я|\u0456нструкц\u0456\u0457|кроки|рецепт|preparation|directions|method|instructions|steps|\u044fк готувати)(?=\s|$|[:：])/iu;
const DESC_HEADERS = /^(?:опис|about|description|нотатки|notes)(?=\s|$|[:：])/iu;

const MEASURE_ONLY =
  /^[\d¼½¾⅓⅔.,/\s]+(?:g|kg|ml|l|oz|lb|lbs|cup|cups|tsp|tbsp|шт|г|кг|мл|л|ч\.?\s*л\.?|ст\.?\s*л\.?)\.?$/i;

function stripHeaderColon(line: string): string {
  return line.replace(/[:：]\s*$/, "").trim();
}

/** Headers, servings — not food. (Measure-only lines are handled by merge.) */
function isMetaLine(line: string): boolean {
  const t = stripHeaderColon(line);
  if (!t) return true;
  if (ING_HEADERS.test(t) || STEP_HEADERS.test(t) || DESC_HEADERS.test(t)) return true;
  if (/^(?:на|for)\s+\d+\s*(?:осіб|ос\.?|персон|люд|people|persons?|servings?|порц)/iu.test(t)) {
    return true;
  }
  if (/^\d+\s*(?:осіб|ос\.?|people|persons?|servings?|порц)/iu.test(t)) return true;
  if (/^(?:serves?|порці[ії]|кількість|yield)(?=\s|$|[:：])/iu.test(t)) return true;
  return false;
}

function looksLikeIngredient(line: string): boolean {
  if (line.length < 2 || line.length > 120) return false;
  if (isMetaLine(line)) return false;
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
    // short food names without punctuation (e.g. "помідор груша")
    (words >= 1 && words <= 8 && !/[.!?]/.test(line) && /[a-zа-яіїєґ]/i.test(line))
  );
}

function looksLikeStep(line: string): boolean {
  if (line.length < 8) return false;
  if (isMetaLine(line)) return false;
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
    text.match(/(\d+)\s*(?:порц(?:ії|ій)?|servings?|persons?|people|осіб|чел)\b/i) ||
    text.match(/(?:на|for)\s+(\d+)\s*(?:осіб|people|persons?|порц)?/i);
  return m ? Math.max(1, Number(m[1])) : 4;
}

/** Join "1 kg" + "tomatoes" into one ingredient line when split across rows. */
function mergeIngredientLines(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || isMetaLine(line)) continue;

    if (MEASURE_ONLY.test(line) && i + 1 < lines.length) {
      const next = lines[i + 1].trim();
      if (next && !isMetaLine(next) && !MEASURE_ONLY.test(next) && !/^\d/.test(next)) {
        out.push(`${line} ${next}`);
        i += 1;
        continue;
      }
      continue;
    }

    // Name on one line, amount on the next: "tomatoes" / "1 kg"
    if (
      !MEASURE_ONLY.test(line) &&
      !/^\d/.test(line) &&
      i + 1 < lines.length &&
      MEASURE_ONLY.test(lines[i + 1].trim())
    ) {
      out.push(`${lines[i + 1].trim()} ${line}`);
      i += 1;
      continue;
    }

    if (looksLikeIngredient(line) || /[a-zа-яіїєґ]/i.test(line)) {
      out.push(line);
    }
  }
  return out;
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
    // First line is the title unless it is clearly a measured ingredient
    if (!skippedTitle && line === lines[0]) {
      skippedTitle = true;
      const clearlyMeasured =
        /^\d/.test(line) ||
        /[—–-]/.test(line) ||
        /\d\s*(г|кг|мл|л|шт|cup|tsp|tbsp)\b/i.test(line);
      if (!clearlyMeasured && line.length < 120 && !ING_HEADERS.test(stripHeaderColon(line))) {
        continue;
      }
    }

    if (ING_HEADERS.test(stripHeaderColon(line))) {
      mode = "ingredients";
      continue;
    }
    if (STEP_HEADERS.test(stripHeaderColon(line))) {
      mode = "steps";
      continue;
    }
    if (DESC_HEADERS.test(stripHeaderColon(line))) {
      mode = "description";
      continue;
    }

    if (isMetaLine(line)) {
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
    if (looksLikeIngredient(line) || MEASURE_ONLY.test(line)) {
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
    const body = lines.slice(1).filter((l) => !isMetaLine(l) && l !== title);
    const mid = Math.max(1, Math.ceil(body.length / 2));
    ingredientLines.push(...body.slice(0, mid));
    stepLines.push(...body.slice(mid));
    warnings.push(
      "Структуру визначено приблизно. Перевірте інгредієнти та кроки перед збереженням.",
    );
  } else if (ingredientLines.length === 0) {
    warnings.push("Інгредієнти не знайдено автоматично — додайте їх у редакторі.");
  } else if (stepLines.length === 0) {
    warnings.push("Кроки не знайдено автоматично — додайте їх у редакторі.");
  }

  const merged = mergeIngredientLines(ingredientLines);
  const ingredients: Ingredient[] =
    merged.length > 0
      ? merged
          .map(parseIngredientLine)
          .filter(
            (i) =>
              i.name &&
              !isMetaLine(i.name) &&
              !MEASURE_ONLY.test(i.name) &&
              !/^(інгредієнти|ingredients|склад)\b/i.test(i.name),
          )
      : [{ name: "Додайте інгредієнти", amount: 1, unit: "порція", aisle: "other" }];

  const steps: RecipeStep[] =
    stepLines.length > 0
      ? stepLines
          .map((text, i) => ({ order: i + 1, text: text.trim() }))
          .filter((s) => s.text && !isMetaLine(s.text))
      : [{ order: 1, text: "Опишіть кроки приготування." }];

  // If first "title" looks like an ingredient, invent a title
  if (looksLikeIngredient(title) || isMetaLine(title) || ING_HEADERS.test(title) || STEP_HEADERS.test(title)) {
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
