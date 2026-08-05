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

/**
 * Reliable culinary glossary (EN/ES/IT/FR/DE + common bad Cyrillic transliterations).
 * Used before machine translate — Google often transliterates short words (Agua→Агуа).
 */
const FOOD_TO_UK: Record<string, string> = {
  // water / salt / oil
  water: "вода",
  agua: "вода",
  eau: "вода",
  wasser: "вода",
  acqua: "вода",
  агуа: "вода",
  salt: "сіль",
  sal: "сіль",
  sel: "сіль",
  sale: "сіль",
  salz: "сіль",
  сал: "сіль",
  sugar: "цукор",
  azucar: "цукор",
  azúcar: "цукор",
  zucker: "цукор",
  sucre: "цукор",
  zucchero: "цукор",
  // oils & fats
  oil: "олія",
  aceite: "олія",
  "aceite de oliva": "оливкова олія",
  "aceite de oliva virgen": "оливкова олія першого віджиму",
  "aceite de oliva virgen extra": "оливкова олія extra virgin",
  "olive oil": "оливкова олія",
  "extra virgin olive oil": "оливкова олія extra virgin",
  "huile d'olive": "оливкова олія",
  olivenol: "оливкова олія",
  olivenöl: "оливкова олія",
  butter: "вершкове масло",
  mantequilla: "вершкове масло",
  beurre: "вершкове масло",
  burro: "вершкове масло",
  butterschmalz: "топлений жир",
  // aromatics
  garlic: "часник",
  ajo: "часник",
  ail: "часник",
  aglio: "часник",
  knoblauch: "часник",
  ахо: "часник",
  onion: "цибуля",
  cebolla: "цибуля",
  oignon: "цибуля",
  cipolla: "цибуля",
  zwiebel: "цибуля",
  себолла: "цибуля",
  shallot: "шалот",
  chalota: "шалот",
  // produce
  tomato: "помідор",
  tomatoes: "помідори",
  tomate: "помідор",
  tomates: "помідори",
  "tomate frito": "томатна паста",
  cucumber: "огірок",
  pepino: "огірок",
  concombre: "огірок",
  cetriolo: "огірок",
  gurke: "огірок",
  пепіно: "огірок",
  pepper: "перець",
  peppers: "перці",
  pimiento: "перець",
  pimientos: "перці",
  "pimiento rojo": "червоний перець",
  "pimiento verde": "зелений перець",
  "bell pepper": "солодкий перець",
  poivron: "солодкий перець",
  paprika: "паприка",
  pimenton: "паприка",
  pimentón: "паприка",
  "pimenton dulce": "солодка паприка",
  "pimentón dulce": "солодка паприка",
  carrot: "морква",
  zanahoria: "морква",
  carotte: "морква",
  carota: "морква",
  möhre: "морква",
  mohre: "морква",
  potato: "картопля",
  potatoes: "картопля",
  patata: "картопля",
  patatas: "картопля",
  pomme: "яблуко", // careful - pomme de terre below
  "pomme de terre": "картопля",
  kartoffel: "картопля",
  lemon: "лимон",
  limon: "лимон",
  limón: "лимон",
  citron: "лимон",
  limone: "лимон",
  zitrone: "лимон",
  lime: "лайм",
  lima: "лайм",
  orange: "апельсин",
  naranja: "апельсин",
  apple: "яблуко",
  manzana: "яблуко",
  banana: "банан",
  platano: "банан",
  plátano: "банан",
  avocado: "авокадо",
  aguacate: "авокадо",
  bread: "хліб",
  pan: "хліб",
  pain: "хліб",
  brot: "хліб",
  pane: "хліб",
  flour: "борошно",
  harina: "борошно",
  farine: "борошно",
  farina: "борошно",
  mehl: "борошно",
  rice: "рис",
  arroz: "рис",
  riz: "рис",
  riso: "рис",
  reis: "рис",
  egg: "яйце",
  eggs: "яйця",
  huevo: "яйце",
  huevos: "яйця",
  oeuf: "яйце",
  œuf: "яйце",
  uovo: "яйце",
  uova: "яйця",
  ei: "яйце",
  eier: "яйця",
  milk: "молоко",
  leche: "молоко",
  lait: "молоко",
  latte: "молоко",
  milch: "молоко",
  cream: "вершки",
  nata: "вершки",
  crema: "вершки",
  crème: "вершки",
  cheese: "сир",
  queso: "сир",
  fromage: "сир",
  formaggio: "сир",
  käse: "сир",
  kase: "сир",
  vinegar: "оцет",
  vinagre: "оцет",
  "vinagre de jerez": "хересний оцет",
  vinaigre: "оцет",
  aceto: "оцет",
  essig: "оцет",
  wine: "вино",
  vino: "вино",
  vin: "вино",
  wein: "вино",
  "vino blanco": "біле вино",
  "vino tinto": "червоне вино",
  "white wine": "біле вино",
  "red wine": "червоне вино",
  parsley: "петрушка",
  perejil: "петрушка",
  persil: "петрушка",
  prezzemolo: "петрушка",
  petersilie: "петрушка",
  basil: "базилік",
  albahaca: "базилік",
  basilic: "базилік",
  basilico: "базилік",
  oregano: "орегано",
  orégano: "орегано",
  thyme: "чебрець",
  tomillo: "чебрець",
  thym: "чебрець",
  rosemary: "розмарин",
  romero: "розмарин",
  romarin: "розмарин",
  cumin: "кмин",
  comino: "кмин",
  peppercorn: "перець горошком",
  "black pepper": "чорний перець",
  "pimienta negra": "чорний перець",
  pimienta: "перець",
  chicken: "курка",
  pollo: "курка",
  poulet: "курка",
  huhn: "курка",
  beef: "яловичина",
  carne: "м'ясо",
  "carne de res": "яловичина",
  ternera: "телятина",
  pork: "свинина",
  cerdo: "свинина",
  porc: "свинина",
  maiale: "свинина",
  fish: "риба",
  pescado: "риба",
  poisson: "риба",
  pesce: "риба",
  fisch: "риба",
  shrimp: "креветки",
  gambas: "креветки",
  crevettes: "креветки",
  honey: "мед",
  miel: "мед",
  miele: "мед",
  honig: "мед",
  yogurt: "йогурт",
  yoghurt: "йогурт",
  yogur: "йогурт",
  mayonnaise: "майонез",
  mayonesa: "майонез",
  mustard: "гірчиця",
  mostaza: "гірчиця",
  moutarde: "гірчиця",
  soy: "соєвий соус",
  "soy sauce": "соєвий соус",
  "salsa de soja": "соєвий соус",
  broth: "бульйон",
  caldo: "бульйон",
  stock: "бульйон",
  "chicken broth": "куриний бульйон",
  "caldo de pollo": "куриний бульйон",
  bean: "квасоля",
  beans: "квасоля",
  frijol: "квасоля",
  frijoles: "квасоля",
  garbanzo: "нут",
  garbanzos: "нут",
  chickpea: "нут",
  chickpeas: "нут",
  lentil: "сочевиця",
  lentils: "сочевиця",
  lentejas: "сочевиця",
  corn: "кукурудза",
  maiz: "кукурудза",
  maíz: "кукурудза",
  spinach: "шпинат",
  espinaca: "шпинат",
  espinacas: "шпинат",
  lettuce: "салат",
  lechuga: "салат",
  mushroom: "печериці",
  mushrooms: "печериці",
  champinion: "печериці",
  champiñón: "печериці",
  champiñones: "печериці",
  champignon: "печериці",
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

function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalizeFoodKey(input: string): string {
  return stripDiacritics(input)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[''`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Map known culinary terms; longest phrase wins. */
function glossaryTranslate(text: string): string | null {
  const key = normalizeFoodKey(text);
  if (!key) return null;

  const polish = (value: string) =>
    value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

  if (FOOD_TO_UK[key]) return polish(FOOD_TO_UK[key]);

  // Try without leading articles
  const noArticle = key.replace(/^(?:el|la|los|las|un|una|the|a|an|le|les|der|die|das)\s+/, "");
  if (noArticle !== key && FOOD_TO_UK[noArticle]) return polish(FOOD_TO_UK[noArticle]);

  // Phrase substitution for multi-word leftovers (longest keys first)
  const keys = Object.keys(FOOD_TO_UK).sort((a, b) => b.length - a.length);
  let out = key;
  let changed = false;
  for (const k of keys) {
    if (k.length < 3) continue;
    const re = new RegExp(`(?:^|\\s)${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "gi");
    if (re.test(out)) {
      out = out.replace(re, (m) => {
        const lead = /^\s/.test(m) ? m[0] : "";
        return lead + FOOD_TO_UK[k];
      });
      changed = true;
    }
  }
  return changed ? polish(out) : null;
}

/** True when text already reads as Ukrainian. */
export function looksUkrainian(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  // Known foreign culinary terms (even in Cyrillic transliteration) still need mapping
  if (glossaryTranslate(t)) return false;
  // Ukrainian-specific letters
  if (/[іїєґІЇЄҐ]/.test(t)) return true;
  const letters = t.replace(/[^a-zA-Zа-яА-ЯёЁіІїЇєЄґҐ]/g, "");
  if (!letters) return true;
  const cyr = (letters.match(/[а-яА-ЯёЁіІїЇєЄґҐ]/g) || []).length;
  const lat = (letters.match(/[a-zA-Z]/g) || []).length;
  // Mostly Latin → not Ukrainian
  if (lat > cyr * 2 && lat >= 3) return false;
  if (lat >= 2 && cyr === 0) return false;
  // Cyrillic without Ukrainian letters is likely Russian → translate
  if (cyr > 0 && !/[іїєґІЇЄҐ]/.test(t) && /[ыэёъЫЭЁЪ]/.test(t)) return false;
  // Known Cyrillic transliterations of foreign food words (Агуа, Сал)
  if (cyr > 0 && lat === 0 && FOOD_TO_UK[normalizeFoodKey(t)]) return false;
  // Cyrillic body text without Russian markers — treat as already local enough
  if (cyr > 0 && lat === 0) return true;
  return false;
}

function needsTranslation(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  if (glossaryTranslate(t)) return true;
  return !looksUkrainian(t);
}

function localizeUnit(unit: string): string {
  const key = unit.trim().toLowerCase();
  return UNIT_TO_UK[key] || UNIT_TO_UK[key.replace(/\.$/, "")] || unit;
}

/** Rough latin→cyrillic phonetic map to spot bad transliterations (Agua→Агуа). */
function approxLatinToCyr(latin: string): string {
  let s = stripDiacritics(latin).toLowerCase();
  const digraphs: [string, string][] = [
    ["sch", "ш"],
    ["ch", "ч"],
    ["sh", "ш"],
    ["zh", "ж"],
    ["kh", "х"],
    ["ph", "ф"],
    ["th", "т"],
    ["qu", "к"],
    ["gu", "г"],
    ["ll", "ль"],
    ["ñ", "нь"],
  ];
  for (const [a, b] of digraphs) s = s.split(a).join(b);
  const map: Record<string, string> = {
    a: "а",
    b: "б",
    c: "к",
    d: "д",
    e: "е",
    f: "ф",
    g: "г",
    h: "х",
    i: "і",
    j: "х",
    k: "к",
    l: "л",
    m: "м",
    n: "н",
    o: "о",
    p: "п",
    q: "к",
    r: "р",
    s: "с",
    t: "т",
    u: "у",
    v: "в",
    w: "в",
    x: "кс",
    y: "и",
    z: "з",
  };
  return [...s].map((ch) => map[ch] || ch).join("");
}

function looksLikeTransliteration(source: string, translated: string): boolean {
  const srcLetters = source.replace(/[^a-zA-Zа-яА-ЯіїєґІЇЄҐёЁ]/g, "");
  const dstLetters = translated.replace(/[^a-zA-Zа-яА-ЯіїєґІЇЄҐёЁ]/g, "");
  if (!srcLetters || !dstLetters) return false;
  const srcLat = /[a-zA-Z]/.test(srcLetters);
  const dstCyr = /[а-яА-ЯіїєґІЇЄҐёЁ]/.test(dstLetters);
  if (!(srcLat && dstCyr)) return false;
  // Real Ukrainian translations usually introduce і/ї/є/ґ or change length a lot
  if (/[іїєґІЇЄҐ]/.test(translated) && Math.abs(srcLetters.length - dstLetters.length) >= 2) {
    return false;
  }
  const approx = approxLatinToCyr(srcLetters);
  const normDst = stripDiacritics(dstLetters).toLowerCase().replace(/ё/g, "е");
  if (approx === normDst) return true;
  // Soft match: shared prefix (≥60%) for short words
  if (srcLetters.length <= 12) {
    let same = 0;
    const n = Math.min(approx.length, normDst.length);
    for (let i = 0; i < n; i++) if (approx[i] === normDst[i]) same++;
    if (n > 0 && same / n >= 0.7) return true;
  }
  return false;
}

function guessSourceLangs(text: string): string[] {
  const t = text.toLowerCase();
  const ordered: string[] = [];
  const push = (lang: string) => {
    if (!ordered.includes(lang)) ordered.push(lang);
  };
  if (/[ñ¿¡]|\b(agua|aceite|ajo|cebolla|tomate|pimiento|perejil|vinagre|harina|huevo|leche|sal)\b/.test(t)) {
    push("es");
  }
  if (/\b(the|and|with|olive|garlic|onion|salt|water|flour|butter)\b/.test(t)) push("en");
  if (/\b(huile|ail|oignon|sel|eau|farine|beurre|tomate)\b/.test(t)) push("fr");
  if (/\b(olio|aglio|cipolla|sale|acqua|farina|burro|pomodoro)\b/.test(t)) push("it");
  if (/\b(öl|knoblauch|zwiebel|salz|wasser|mehl|butter)\b/.test(t)) push("de");
  if (/\b(água|azeite|alho|cebola|sal|farinha)\b/.test(t)) push("pt");
  // Default retry order for short ambiguous words
  for (const lang of ["es", "en", "it", "fr", "pt", "de"]) push(lang);
  return ordered;
}

async function translateViaGoogle(
  text: string,
  sourceLang = "auto",
): Promise<{ text: string; lang: string }> {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=uk&dt=t&q=` +
    encodeURIComponent(text);
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`translate ${res.status}`);
  const data = (await res.json()) as unknown[];
  const chunks = data[0] as Array<[string, string]> | null;
  const translated = chunks?.map((c) => c[0]).join("") ?? text;
  const lang = typeof data[2] === "string" ? data[2] : sourceLang;
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

function scoreTranslation(source: string, candidate: string): number {
  if (!candidate || candidate === source) return 0;
  if (looksLikeTransliteration(source, candidate)) return 1;
  let score = 5;
  if (/[іїєґІЇЄҐ]/.test(candidate)) score += 4;
  if (glossaryTranslate(candidate)) score += 2;
  // Prefer results that differ meaningfully from phonetic copy
  score += Math.min(6, Math.abs(candidate.length - source.length));
  return score;
}

export async function translateToUkrainian(
  text: string,
): Promise<{ text: string; lang: string; translated: boolean }> {
  const cleaned = text.trim();
  if (!cleaned) {
    return { text: cleaned, lang: "uk", translated: false };
  }

  const glossed = glossaryTranslate(cleaned);
  if (glossed) {
    return { text: glossed, lang: "glossary", translated: glossed !== cleaned };
  }

  if (!needsTranslation(cleaned)) {
    return { text: cleaned, lang: "uk", translated: false };
  }

  try {
    const auto = await translateViaGoogle(cleaned, "auto");
    let best = auto;
    let bestScore = scoreTranslation(cleaned, auto.text);

    // Auto often mislabels Spanish as English and transliterates short words
    if (
      bestScore < 8 ||
      looksLikeTransliteration(cleaned, auto.text) ||
      auto.lang === "en" && cleaned.length <= 24
    ) {
      for (const lang of guessSourceLangs(cleaned).slice(0, 4)) {
        try {
          const attempt = await translateViaGoogle(cleaned, lang);
          const score = scoreTranslation(cleaned, attempt.text) + (lang === "es" ? 1 : 0);
          if (score > bestScore) {
            best = { ...attempt, lang };
            bestScore = score;
          }
          if (bestScore >= 10 && !looksLikeTransliteration(cleaned, best.text)) break;
        } catch {
          /* next lang */
        }
      }
    }

    // Final glossary pass on machine output (fixes leftover foreign tokens)
    const afterGloss = glossaryTranslate(best.text) || best.text;

    if (best.lang === "uk" || best.lang === "ukrainian") {
      // Detected as Ukrainian but may still be a foreign transliteration in Cyrillic
      const fixed = glossaryTranslate(cleaned);
      if (fixed) return { text: fixed, lang: "glossary", translated: true };
      return { text: cleaned, lang: "uk", translated: false };
    }

    return {
      text: afterGloss,
      lang: best.lang,
      translated: afterGloss !== cleaned,
    };
  } catch {
    try {
      const result = await translateViaMyMemory(cleaned);
      const afterGloss = glossaryTranslate(result.text) || result.text;
      return { text: afterGloss, lang: result.lang, translated: afterGloss !== cleaned };
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
