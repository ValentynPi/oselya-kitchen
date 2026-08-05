import type { Ingredient, RecipeStep } from "@/lib/types";
import type { ExtractedRecipe } from "@/lib/extract";

const UNIT_TO_UK: Record<string, string> = {
  g: "г",
  gr: "г",
  gram: "г",
  grams: "г",
  kg: "кг",
  kilogram: "кг",
  kilograms: "кг",
  ml: "мл",
  milliliter: "мл",
  milliliters: "мл",
  millilitre: "мл",
  millilitres: "мл",
  l: "л",
  liter: "л",
  liters: "л",
  litre: "л",
  litres: "л",
  cup: "скл.",
  cups: "скл.",
  tsp: "ч.л.",
  teaspoon: "ч.л.",
  teaspoons: "ч.л.",
  tbsp: "ст.л.",
  tablespoon: "ст.л.",
  tablespoons: "ст.л.",
  oz: "унцій",
  ounce: "унцій",
  ounces: "унцій",
  lb: "фунт",
  lbs: "фунт",
  pound: "фунт",
  pounds: "фунт",
  pinch: "щіпка",
  pinches: "щіпка",
  clove: "зубч.",
  cloves: "зубч.",
  slice: "скибка",
  slices: "скибки",
  can: "банка",
  cans: "банки",
  pack: "пачка",
  package: "пачка",
  bunch: "пучок",
  sprig: "гілочка",
  sprigs: "гілочки",
  piece: "шт",
  pieces: "шт",
  pcs: "шт",
  pc: "шт",
};

const LANG_LABELS: Record<string, string> = {
  en: "англійської",
  de: "німецької",
  fr: "французької",
  es: "іспанської",
  it: "італійської",
  pl: "польської",
  ru: "російської",
  pt: "португальської",
  nl: "нідерландської",
  tr: "турецької",
  cs: "чеської",
  sk: "словацької",
  hu: "угорської",
  ro: "румунської",
  el: "грецької",
  ja: "японської",
  zh: "китайської",
  ko: "корейської",
  ar: "арабської",
};

/** True when text already reads as Ukrainian. */
export function looksUkrainian(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  // Ukrainian-specific letters
  if (/[іїєґІЇЄҐ]/.test(t)) return true;
  const letters = t.replace(/[^a-zA-Zа-яА-ЯёЁіІїЇєЄґҐ]/g, "");
  if (!letters) return true;
  const cyr = (letters.match(/[а-яА-ЯёЁіІїЇєЄґҐ]/g) || []).length;
  const lat = (letters.match(/[a-zA-Z]/g) || []).length;
  // Mostly Latin → not Ukrainian
  if (lat > cyr * 2 && lat >= 4) return false;
  // Cyrillic without Ukrainian letters is likely Russian → translate
  if (cyr > 0 && !/[іїєґІЇЄҐ]/.test(t) && /[ыэёъЫЭЁЪ]/.test(t)) return false;
  // Pure Cyrillic short food words without UK markers — still translate if Russian markers absent but Latin absent
  // Conservative: only skip when Ukrainian markers present (handled above) or no letters
  return false;
}

function needsTranslation(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  return !looksUkrainian(t);
}

function localizeUnit(unit: string): string {
  const key = unit.trim().toLowerCase();
  return UNIT_TO_UK[key] || UNIT_TO_UK[key.replace(/\.$/, "")] || unit;
}

async function translateViaGoogle(text: string): Promise<{ text: string; lang: string }> {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=uk&dt=t&q=" +
    encodeURIComponent(text);
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`translate ${res.status}`);
  const data = (await res.json()) as unknown[];
  const chunks = data[0] as Array<[string, string]> | null;
  const translated = chunks?.map((c) => c[0]).join("") ?? text;
  const lang = typeof data[2] === "string" ? data[2] : "auto";
  return { text: translated.trim() || text, lang };
}

async function translateViaMyMemory(text: string): Promise<{ text: string; lang: string }> {
  const url =
    "https://api.mymemory.translated.net/get?langpair=autodetect|uk&q=" +
    encodeURIComponent(text.slice(0, 450));
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`mymemory ${res.status}`);
  const data = (await res.json()) as {
    responseData?: { translatedText?: string };
    responseStatus?: number;
  };
  const translated = data.responseData?.translatedText?.trim();
  if (!translated || data.responseStatus !== 200) throw new Error("mymemory empty");
  // MyMemory sometimes echoes "INVALID SOURCE LANGUAGE" etc.
  if (/INVALID|MYMEMORY WARNING/i.test(translated)) throw new Error("mymemory warn");
  return { text: translated, lang: "auto" };
}

export async function translateToUkrainian(
  text: string,
): Promise<{ text: string; lang: string; translated: boolean }> {
  const cleaned = text.trim();
  if (!cleaned || !needsTranslation(cleaned)) {
    return { text: cleaned, lang: "uk", translated: false };
  }

  try {
    const result = await translateViaGoogle(cleaned);
    if (result.lang === "uk" || result.lang === "ukrainian") {
      return { text: cleaned, lang: "uk", translated: false };
    }
    return { text: result.text, lang: result.lang, translated: result.text !== cleaned };
  } catch {
    try {
      const result = await translateViaMyMemory(cleaned);
      return { text: result.text, lang: result.lang, translated: result.text !== cleaned };
    } catch {
      return { text: cleaned, lang: "auto", translated: false };
    }
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return out;
}

async function translateIngredient(ing: Ingredient): Promise<Ingredient> {
  const unit = localizeUnit(ing.unit || "");
  if (!needsTranslation(ing.name)) {
    return { ...ing, unit };
  }
  const { text } = await translateToUkrainian(ing.name);
  return {
    ...ing,
    name: text,
    unit,
  };
}

async function translateStep(step: RecipeStep): Promise<RecipeStep> {
  if (!needsTranslation(step.text)) return step;
  const { text } = await translateToUkrainian(step.text);
  return { ...step, text };
}

const UK_BOILERPLATE =
  /створено з вставленого тексту|перевірте картку|імпортовано з|додайте інгредієнти|опишіть кроки|рецепт з тексту|див\. джерело/i;

function isUkrainianBoilerplate(text: string): boolean {
  return UK_BOILERPLATE.test(text);
}

/**
 * Translate recipe fields to Ukrainian when the source is another language.
 * Keeps amounts; localizes common English units.
 */
export async function translateRecipeToUkrainian(
  recipe: ExtractedRecipe,
): Promise<ExtractedRecipe> {
  // Decide from real content only — ignore Ukrainian placeholder copy from the parser
  const contentParts = [
    recipe.title,
    ...recipe.ingredients.map((i) => i.name),
    ...recipe.steps.map((s) => s.text),
  ].filter((t) => t && !isUkrainianBoilerplate(t));

  const shouldTranslate = contentParts.some((t) => needsTranslation(t));

  if (!shouldTranslate) {
    return {
      ...recipe,
      ingredients: recipe.ingredients.map((i) => ({
        ...i,
        unit: localizeUnit(i.unit || ""),
      })),
    };
  }

  const titleResult = isUkrainianBoilerplate(recipe.title)
    ? { text: recipe.title, lang: "uk", translated: false }
    : await translateToUkrainian(recipe.title);

  const descResult =
    !recipe.description || isUkrainianBoilerplate(recipe.description)
      ? { text: recipe.description, lang: "uk", translated: false }
      : await translateToUkrainian(recipe.description);

  const ingredients = await mapPool(recipe.ingredients, 3, async (ing) => {
    if (isUkrainianBoilerplate(ing.name)) {
      return { ...ing, unit: localizeUnit(ing.unit || "") };
    }
    return translateIngredient(ing);
  });

  const steps = await mapPool(recipe.steps, 2, async (step) => {
    if (isUkrainianBoilerplate(step.text)) return step;
    return translateStep(step);
  });

  const sourceLang = titleResult.lang !== "uk" ? titleResult.lang : descResult.lang;
  const didTranslate =
    titleResult.translated ||
    descResult.translated ||
    ingredients.some((ing, i) => ing.name !== recipe.ingredients[i]?.name) ||
    steps.some((s, i) => s.text !== recipe.steps[i]?.text);

  const langLabel =
    LANG_LABELS[sourceLang] ||
    (sourceLang !== "uk" && sourceLang !== "auto" ? sourceLang : null);
  const warnings = [...recipe.warnings];
  if (didTranslate) {
    warnings.push(
      langLabel
        ? `Текст перекладено українською з ${langLabel}. Перевірте формулювання.`
        : "Текст перекладено українською. Перевірте формулювання.",
    );
  }

  return {
    ...recipe,
    title: titleResult.text || recipe.title,
    description: descResult.text || recipe.description,
    ingredients,
    steps,
    warnings,
  };
}
