import { guessAisle } from "@/lib/ai";
import type { Ingredient } from "@/lib/types";

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&frac14;/gi, "¼")
    .replace(/&frac12;/gi, "½")
    .replace(/&frac34;/gi, "¾")
    .replace(/&frac13;/gi, "⅓")
    .replace(/&frac23;/gi, "⅔")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

/** Normalize a raw ingredient string from a recipe page. */
export function cleanIngredientText(input: string): string {
  return decodeEntities(input)
    .replace(/<[^>]+>/g, " ")
    .replace(/^[-•*–—]\s*/, "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function parseAmount(raw: string): number {
  const t = raw.trim().replace(",", ".");
  const mixedUnicode = t.match(/^(\d+)\s*([¼½¾⅓⅔])$/);
  if (mixedUnicode) return Number(mixedUnicode[1]) + parseAmount(mixedUnicode[2]);
  const mixedAscii = t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedAscii) return Number(mixedAscii[1]) + Number(mixedAscii[2]) / Number(mixedAscii[3]);
  if (t.includes("/")) {
    const [a, b] = t.split("/").map(Number);
    if (a && b) return a / b;
  }
  const mapped = t
    .replace(/¼/g, ".25")
    .replace(/½/g, ".5")
    .replace(/¾/g, ".75")
    .replace(/⅓/g, ".333")
    .replace(/⅔/g, ".667");
  const n = Number(mapped);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

const UNIT_ALIASES: Record<string, string> = {
  g: "g",
  gr: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  l: "l",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  cup: "cup",
  cups: "cups",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tbsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  pinch: "pinch",
  pinches: "pinch",
  clove: "clove",
  cloves: "cloves",
  slice: "slice",
  slices: "slices",
  can: "can",
  cans: "cans",
  package: "pack",
  pack: "pack",
  bunch: "bunch",
  sprig: "sprig",
  sprigs: "sprigs",
  шт: "шт",
  штука: "шт",
  штуки: "шт",
  г: "г",
  кг: "кг",
  мл: "мл",
  л: "л",
  "ч.л.": "ч.л.",
  "ч л": "ч.л.",
  "чл": "ч.л.",
  "ст.л.": "ст.л.",
  "ст л": "ст.л.",
  "стл": "ст.л.",
  зубч: "зубч.",
  "зубч.": "зубч.",
  зубок: "зубч.",
  зубчик: "зубч.",
  зубчики: "зубч.",
  пучок: "пучок",
  пучка: "пучок",
  пучки: "пучок",
  пучків: "пучок",
  щіпка: "щіпка",
  щіпки: "щіпка",
};

const UNIT_RE =
  "teaspoons?|tablespoons?|tsp|tbsp|grams?|kilograms?|millilit(?:er|re)s?|lit(?:er|re)s?|ounces?|pounds?|cups?|pinch(?:es)?|cloves?|slices?|cans?|packages?|packs?|bunch(?:es)?|sprigs?|lbs?|oz|kg|ml|g|gr|l|шт|штука|штуки|г|кг|мл|л|ч\\.?\\s*л\\.?|ст\\.?\\s*л\\.?|зубч\\.?(?:ик[аи]?)?|пучк(?:а|и|ів|ом)?|пучок|щіпк[аи]";

const AMOUNT_RE =
  "(?:\\d+\\s*)?[¼½¾⅓⅔]|\\d+\\s+\\d+\\s*/\\s*\\d+|\\d+\\s*/\\s*\\d+|\\d+(?:[.,]\\d+)?(?:\\s*[-–—]\\s*\\d+(?:[.,]\\d+)?)?";

function normalizeUnit(unit: string): string {
  const key = unit.replace(/\s+/g, " ").trim().toLowerCase();
  return UNIT_ALIASES[key] || UNIT_ALIASES[key.replace(/\s/g, "")] || unit.trim();
}

function stripLeadingOf(name: string): string {
  return name.replace(/^(?:of\s+|із\s+|з\s+)/i, "").trim();
}

function countMeasureClauses(line: string): number {
  // Ignore amounts inside notes like "(scale back to ¾ teaspoon)"
  const withoutNotes = line.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
  const re = new RegExp(
    `(?:${AMOUNT_RE})\\s*(?:${UNIT_RE})(?=\\s|$|[^a-zA-Zа-яА-Яіїєґ])`,
    "gi",
  );
  return [...withoutNotes.matchAll(re)].length;
}

/**
 * Intelligent ingredient parse:
 * - Prefer structured amount/unit/name when confident
 * - Keep the full original line when the text has multiple measures,
 *   ranges that are unclear, or odd compound phrasing — so the UI stays faithful
 */
function finalizeName(name: string): string {
  return name
    .replace(/^[.\s]+/, "")
    .replace(/[;,.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function smartParseIngredient(raw: string): Ingredient {
  const original = cleanIngredientText(raw).replace(/[;]+$/g, "").trim();
  if (!original) {
    return { name: "Інгредієнт", amount: 1, unit: "", aisle: "other" };
  }

  // Section headers like "For the frosting:"
  if (/^(?:for the|для)\b/i.test(original) && original.endsWith(":")) {
    return { name: original, amount: 1, unit: "", aisle: "other" };
  }

  // Compound measures: "½ cup + 1 tablespoon honey" — keep verbatim
  if (countMeasureClauses(original) >= 2 || /\d[^\d+]{0,20}\+\s*\d/.test(original)) {
    return { name: original, amount: 1, unit: "", aisle: guessAisle(original) };
  }

  // "225g flour" / "1 ½ cups oats" / "2 tbsp sugar" / "300 г борошна" / "2 ст.л. олії"
  const withUnit = original.match(
    new RegExp(
      `^(${AMOUNT_RE})\\s*(${UNIT_RE})(?=\\s|$|[^a-zA-Zа-яА-Яіїєґ])(?:\\s+of)?\\s*(.*)$`,
      "i",
    ),
  );
  if (withUnit) {
    const amountRaw = withUnit[1].replace(/\s+/g, " ").trim();
    // Ranges like 2-3: take the first number for shopping scale
    const range = amountRaw.split(/\s*[-–—]\s*/);
    const amount = parseAmount(range[0]);
    const unit = normalizeUnit(withUnit[2]);
    const name = stripLeadingOf((withUnit[3] || "").trim());
    if (name) {
      const cleanName = finalizeName(name);
      return { name: cleanName, amount, unit, aisle: guessAisle(cleanName) };
    }
    // Unit-only leftover — keep original
    return { name: original, amount, unit, aisle: guessAisle(original) };
  }

  // Ukrainian / dash style: "Борошно — 250 г"
  const dash = original.split(/\s+[—–-]\s+/);
  if (dash.length >= 2) {
    const name = finalizeName(dash[0]);
    const rest = dash.slice(1).join(" ").trim();
    const m = rest.match(new RegExp(`^(${AMOUNT_RE})\\s*(${UNIT_RE})?\\s*$`, "i"));
    if (m) {
      return {
        name,
        amount: parseAmount(m[1].replace(/\s+/g, " ").trim()),
        unit: m[2] ? normalizeUnit(m[2]) : "",
        aisle: guessAisle(name),
      };
    }
  }

  // "a pinch of salt" / "щіпка солі"
  const pinch = original.match(/^(?:a\s+)?(pinch|щіпка)\s+(?:of\s+)?(.+)$/i);
  if (pinch) {
    const name = finalizeName(pinch[2]);
    return {
      name,
      amount: 1,
      unit: /щіпка/i.test(pinch[1]) ? "щіпка" : "pinch",
      aisle: guessAisle(name),
    };
  }

  // Counted items without unit: "3 large eggs", "2 цибулини"
  // Do not treat news timestamps "12:49 Headline" as "12" + ":49 Headline"
  // Do not treat "15 хв" / "2 год" as ingredients
  if (!/^\d{1,2}:\d{2}\b/.test(original) && !isTimeOnlyLine(original)) {
    const countName = original.match(new RegExp(`^(${AMOUNT_RE})\\s+(.+)$`));
    if (countName && !/^\d/.test(countName[2])) {
      const name = finalizeName(countName[2]);
      if (
        !/°|celsius|fahrenheit|degrees/i.test(name) &&
        !/^(?:хв\.?|хвилин[аи]?|год\.?|годин[аи]?|min(?:ute)?s?|hrs?|hours?|h)$/i.test(name) &&
        !isRecipeMetaLine(name)
      ) {
        return {
          name,
          amount: parseAmount(countName[1].replace(/\s+/g, " ").trim()),
          unit: "",
          aisle: guessAisle(name),
        };
      }
    }
  }

  // Unparsed — keep exact text so nothing is lost
  return { name: finalizeName(original), amount: 1, unit: "", aisle: guessAisle(original) };
}

/** Pure duration / clock fragments — never food. */
export function isTimeOnlyLine(line: string): boolean {
  const t = cleanIngredientText(line)
    .replace(/^[•*\-–—]\s*/, "")
    .trim();
  if (!t) return true;

  // Bare time tokens: "хв", "год", "min", "h"
  // Avoid JS \b — it does not treat Cyrillic as word chars.
  if (
    /^(?:хв\.?|хвилин[аи]?|год\.?|годин[аи]?|min(?:ute)?s?|hrs?|hours?|h)$/i.test(t)
  ) {
    return true;
  }

  // "15 хв", "1 год", "1h 15min", "год 15 хв", "1 год 15 хв"
  if (
    /^(?:\d+\s*)?(?:год\.?|годин[аи]?|hrs?|hours?|h)?\s*\d+\s*(?:хв\.?|хвилин[аи]?|min(?:ute)?s?)$/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /^\d+\s*(?:год\.?|годин[аи]?|hrs?|hours?|h)(?:\s+\d+\s*(?:хв\.?|хвилин[аи]?|min(?:ute)?s?))?$/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/^(?:год\.?|годин[аи]?|hrs?|hours?)\s+\d+\s*(?:хв\.?|хвилин[аи]?|min(?:ute)?s?)$/i.test(t)) {
    return true;
  }
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(t)) return true;

  return false;
}

/**
 * Recipe-card chrome: difficulty, time labels, how-to titles, servings — not edible.
 */
export function isRecipeMetaLine(line: string): boolean {
  const t = cleanIngredientText(line).replace(/[:：]\s*$/, "").trim();
  if (!t) return true;
  if (isTimeOnlyLine(t)) return true;

  const end = String.raw`(?=\s|$|[:：])`;

  if (
    new RegExp(
      `^(?:як\\s+приготувати|як\\s+зробити|як\\s+смачно|рецепт\\s+приготування|how\\s+to\\s+(?:make|cook|prepare)|recipe\\s+for)${end}`,
      "i",
    ).test(t)
  ) {
    return true;
  }

  if (
    new RegExp(
      `^(?:складність|рівень(?:\\s+складності)?|difficulty|level|dificultad|dificultat)${end}`,
      "i",
    ).test(t)
  ) {
    return true;
  }

  if (
    new RegExp(
      `^(?:загальний\\s+час|час\\s+приготування|час\\s+підготовки|час\\s+готування|підготовка|розробка|відпочинок|маринування|охолодження|випікання|варіння|смаження|prep(?:\\s*time)?|cook(?:\\s*time)?|total(?:\\s*time)?|preparation|rest(?:ing)?(?:\\s*time)?|marinat(?:e|ing)|cooling|baking|elaboration|elaboraci[oó]n|tiempo\\s+total)${end}`,
      "i",
    ).test(t)
  ) {
    return true;
  }

  if (/^(?:складність|difficulty|рівень|загальний\s+час|prep|cook|total)\s*[:：]/i.test(t)) {
    return true;
  }

  if (
    new RegExp(
      `^(?:порці[ії]|кількість\\s+порцій|на\\s+\\d+\\s*(?:осіб|персон)|serves?|servings?|yield|калорі[їй]|kcal|calories?|енергетична\\s+цінність)${end}`,
      "i",
    ).test(t)
  ) {
    return true;
  }

  if (/^(?:легк[аи]|середн(?:я|ій)|складн[аи]|easy|medium|hard|difficult|simple)$/i.test(t)) {
    return true;
  }

  return false;
}

/** News sidebars / related articles that follow recipes on media sites. */
export function isNewsFeedLine(line: string): boolean {
  const t = cleanIngredientText(line);
  if (!t) return false;

  // "12:49 Škoda Group оголосила…" — classic news ticker
  if (/^\d{1,2}:\d{2}\b/.test(t)) return true;

  // Section headers after the recipe body
  if (
    /^(новини|останні новини|інші новини|більше новин|схожі новини|читайте також|також читайте|вам також|рекомендуємо|топ новин|стрічка|головне сьогодні|популярне|більше за темою|related news|more news|latest news|breaking news|trending)\b/i.test(
      t,
    )
  ) {
    return true;
  }

  // Long non-food headline without a culinary measure
  const hasMeasure =
    new RegExp(`(?:${AMOUNT_RE})\\s*(?:${UNIT_RE})(?=\\s|$|[^a-zA-Zа-яА-Яіїєґ])`, "i").test(t) ||
    /[—–-]\s*\d/.test(t);
  if (!hasMeasure && t.length >= 55) {
    if (
      /оголосила|оголосив|ребрендинг|пасажирськ|літак|ігор\s+\d{4}|розкрила|розкрив|президент|політик|військ|матч|чемпіонат|ребрендинг|масштабн|революційн|топ-\d+/i.test(
        t,
      )
    ) {
      return true;
    }
  }

  return false;
}

export function isChromeIngredient(line: string): boolean {
  const t = cleanIngredientText(line);
  if (t.length < 2) return true;
  if (t.length > 240) return true;
  if (isNewsFeedLine(t)) return true;
  if (isRecipeMetaLine(t)) return true;
  if (/^https?:\/\//i.test(t)) return true;
  if (/^\[[^\]]+\]\([^)]+\)$/.test(t)) return true;
  if (
    /^(url source|markdown content|title:|skip to|jump to|save recipe|print|share|rate this|advertisement|newsletter|subscribe|sign in|log in|cookie|related recipes?|you may also|more recipes|comments?|reviews?|leave a comment|write a review|photo by|recipe by|sponsored)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /^(cookbook|videos?|saved|home|about|contact|search|menu|shop|cart|account|course|cuisine|diet|season|category|categories|appetizers?|baked goods|breakfast|brunch|dessert|dinner|drinks?|salads?|sauces?|sides?|snacks?|soups?|all recipes|view all)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/\b(view all|all recipes|recipe video)\b/i.test(t)) return true;
  if (
    /\b(facebook|instagram|pinterest|twitter|tiktok|pin it|share on)\b/i.test(t) &&
    t.split(/\s+/).length <= 6
  ) {
    return true;
  }
  if (/^(prep|cook|total)\s*time\b/i.test(t)) return true;
  if (/^\d+(\.\d+)?\s*(stars?|ratings?|reviews?)\b/i.test(t)) return true;
  if (
    /^(ingredients?|instructions?|directions?|method|nutrition|notes?|tips?|інгредієнти|приготування|кроки)\s*:?\s*$/i.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}

export function hasQuantitySignal(item: Ingredient): boolean {
  const label = [item.amount && item.unit ? `${item.amount} ${item.unit}` : "", item.name]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (isRecipeMetaLine(item.name) || isRecipeMetaLine(label) || isTimeOnlyLine(label)) return false;
  if (item.unit?.trim()) {
    // Time leftovers mistakenly stored as unit
    if (/^(?:хв|год|min|h|hrs?)$/i.test(item.unit.trim())) return false;
    return true;
  }
  if (item.amount > 0 && item.amount !== 1) return true;
  return /\d/.test(item.name);
}

export function looksMeasuredLine(line: string): boolean {
  const t = cleanIngredientText(line);
  if (isChromeIngredient(t)) return false;
  if (/^[\d¼½¾⅓⅔]/.test(t)) return true;
  if (new RegExp(`\\d+\\s*(?:${UNIT_RE})\\b`, "i").test(t)) return true;
  if (/[—–-].*\d|\d.*[—–-]/.test(t)) return true;
  return false;
}

function isRecipeEndMarker(line: string): boolean {
  return /^(instructions?|directions?|method|steps?|nutrition|notes?|tips?|related|comments?|reviews?|приготування|кроки|новини|читайте також|також читайте)\b/i.test(
    line,
  );
}

/** Trusted schema/scraper lines — keep edible rows, stop at news feeds. */
export function ingredientsFromTrustedLines(lines: string[]): Ingredient[] {
  const out: Ingredient[] = [];
  for (const line of lines) {
    const cleaned = cleanIngredientText(line);
    if (!cleaned) continue;

    // After real ingredients, news/sidebar content ends the list
    if (out.length > 0 && (isNewsFeedLine(cleaned) || isRecipeEndMarker(cleaned))) {
      break;
    }

    if (isNewsFeedLine(cleaned) || isChromeIngredient(cleaned)) continue;
    if (isRecipeEndMarker(cleaned)) break;

    out.push(smartParseIngredient(cleaned));
    if (out.length >= 60) break;
  }
  return out;
}

/** Heuristic lists — stop after trailing chrome / news. */
export function filterIngredientObjects(items: Ingredient[]): Ingredient[] {
  const out: Ingredient[] = [];
  let consecutiveBad = 0;

  for (const item of items) {
    const label = [item.amount && item.unit ? `${item.amount} ${item.unit}` : "", item.name]
      .filter(Boolean)
      .join(" ")
      .trim();

    if (out.length > 0 && (isNewsFeedLine(item.name) || isNewsFeedLine(label))) {
      break;
    }

    if (isChromeIngredient(item.name) || isChromeIngredient(label)) {
      consecutiveBad += 1;
      if (out.length >= 2 && consecutiveBad >= 1) break;
      continue;
    }

    if (isRecipeEndMarker(item.name)) {
      break;
    }

    // Unmeasured long lines after a solid list are usually site chrome
    if (
      out.length >= 3 &&
      !hasQuantitySignal(item) &&
      item.name.length > 70 &&
      out.filter(hasQuantitySignal).length >= 2
    ) {
      break;
    }

    consecutiveBad = 0;
    out.push({
      ...item,
      name: finalizeName(cleanIngredientText(item.name)),
      aisle: item.aisle || guessAisle(item.name),
    });
    if (out.length >= 40) break;
  }

  return out;
}

/** Human-facing line for cards/lists. */
export function formatIngredientDisplay(ing: Ingredient): string {
  const name = ing.name.trim();
  // Original compound / unparsed line already includes measures
  if (
    !ing.unit?.trim() &&
    (ing.amount === 1 || !ing.amount) &&
    (/^[\d¼½¾⅓⅔]/.test(name) || countMeasureClauses(name) >= 1)
  ) {
    return name;
  }
  if (!ing.unit?.trim()) {
    if (!ing.amount || ing.amount === 1) return name;
    return `${formatNumber(ing.amount)} ${name}`.trim();
  }
  return `${formatNumber(ing.amount)} ${ing.unit} ${name}`.trim();
}

function formatNumber(amount: number): string {
  if (!Number.isFinite(amount)) return "";
  if (Number.isInteger(amount)) return String(amount);
  return amount.toFixed(2).replace(/\.?0+$/, "");
}
