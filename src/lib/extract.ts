import recipeDataScraper from "recipe-data-scraper";
import {
  filterIngredientObjects,
  hasQuantitySignal,
  ingredientsFromTrustedLines,
  isChromeIngredient,
  looksMeasuredLine,
  smartParseIngredient,
} from "@/lib/ingredients";
import type { Ingredient, RecipeStep } from "@/lib/types";

export interface ExtractedRecipe {
  title: string;
  description: string;
  sourceUrl: string;
  imageUrl?: string;
  cookTimeMinutes: number;
  servings: number;
  ingredients: Ingredient[];
  steps: RecipeStep[];
  host: string;
  warnings: string[];
}

function parseDurationMinutes(value?: string | number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(1, Math.round(value));
  if (!value || typeof value !== "string") return 30;
  const iso = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (iso) {
    return Math.max(
      1,
      Number(iso[1] || 0) * 60 + Number(iso[2] || 0) + Math.round(Number(iso[3] || 0) / 60),
    );
  }
  // "45 minutes" / "1 hr"
  const hours = value.match(/(\d+)\s*(?:hrs?|hours?|год)/i);
  const mins = value.match(/(\d+)\s*(?:mins?|minutes?|хв)/i);
  if (hours || mins) {
    return Math.max(1, Number(hours?.[1] || 0) * 60 + Number(mins?.[1] || 0));
  }
  const digits = value.match(/(\d+)/);
  return digits ? Math.max(1, Number(digits[1])) : 30;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

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

function stripHtml(input: string): string {
  return decodeEntities(input)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, key: string): string | undefined {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1]);
  }
  return undefined;
}

function parseIngredientLine(line: string): Ingredient {
  return smartParseIngredient(line);
}

function repairJson(raw: string): string {
  return raw.replace(/^\uFEFF/, "").replace(/,\s*([}\]])/g, "$1");
}

function extractJsonLdRecipes(html: string): Record<string, unknown>[] {
  const scripts = [
    ...html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  const found: Record<string, unknown>[] = [];

  for (const match of scripts) {
    for (const candidate of [match[1].trim(), repairJson(match[1].trim())]) {
      try {
        const json = JSON.parse(candidate);
        const nodes = asArray(json).flatMap((node) => {
          if (node && typeof node === "object" && "@graph" in node) {
            return asArray((node as { "@graph": unknown })["@graph"]);
          }
          return [node];
        });
        for (const node of nodes) {
          if (!node || typeof node !== "object") continue;
          const types = asArray((node as { "@type"?: string | string[] })["@type"]).map((t) =>
            String(t).toLowerCase(),
          );
          if (types.some((t) => t === "recipe" || t.endsWith("/recipe"))) {
            found.push(node as Record<string, unknown>);
          }
          for (const ent of asArray((node as { mainEntity?: unknown }).mainEntity)) {
            if (!ent || typeof ent !== "object") continue;
            const et = asArray((ent as { "@type"?: string | string[] })["@type"]).map((t) =>
              String(t).toLowerCase(),
            );
            if (et.some((t) => t === "recipe" || t.endsWith("/recipe"))) {
              found.push(ent as Record<string, unknown>);
            }
          }
        }
        break;
      } catch {
        /* next */
      }
    }
  }
  return found;
}

function instructionsToSteps(instructionsRaw: unknown): RecipeStep[] {
  if (!instructionsRaw) return [];
  if (typeof instructionsRaw === "string") {
    return instructionsRaw
      .split(/\n+|(?<=\.)\s+(?=[A-ZА-ЯІЇЄҐ])/)
      .map(stripHtml)
      .filter(Boolean)
      .map((text, i) => ({ order: i + 1, text }));
  }
  if (Array.isArray(instructionsRaw) && instructionsRaw.every((x) => typeof x === "string")) {
    return (instructionsRaw as string[])
      .map(stripHtml)
      .filter(Boolean)
      .map((text, i) => ({ order: i + 1, text }));
  }
  return asArray(instructionsRaw)
    .flatMap((item) => {
      if (!item) return [];
      if (typeof item === "string") return [stripHtml(item)];
      if (typeof item === "object") {
        const obj = item as { text?: string; itemListElement?: unknown; name?: string };
        if (obj.itemListElement) {
          return asArray(obj.itemListElement).map((el) => {
            if (typeof el === "string") return stripHtml(el);
            if (el && typeof el === "object" && "text" in el) {
              return stripHtml(String((el as { text: string }).text));
            }
            return "";
          });
        }
        return [stripHtml(String(obj.text || obj.name || ""))];
      }
      return [];
    })
    .filter(Boolean)
    .map((text, i) => ({ order: i + 1, text }));
}

function fromJsonLd(data: Record<string, unknown>, url: string, host: string): ExtractedRecipe {
  const imageRaw = data.image;
  let imageUrl: string | undefined;
  if (typeof imageRaw === "string") imageUrl = imageRaw;
  else if (Array.isArray(imageRaw)) {
    const first = imageRaw[0];
    if (typeof first === "string") imageUrl = first;
    else if (first && typeof first === "object" && "url" in first) {
      imageUrl = String((first as { url: string }).url);
    }
  } else if (imageRaw && typeof imageRaw === "object" && "url" in imageRaw) {
    imageUrl = String((imageRaw as { url: string }).url);
  }

  const ingredients = ingredientsFromTrustedLines(
    asArray(data.recipeIngredient as string[] | string | undefined).map(String),
  );

  const servingsRaw = data.recipeYield ?? data.yield;
  let servings = 4;
  if (typeof servingsRaw === "number") servings = servingsRaw;
  else if (Array.isArray(servingsRaw) && servingsRaw[0] != null) {
    const n = String(servingsRaw[0]).match(/(\d+)/);
    if (n) servings = Number(n[1]);
  } else if (typeof servingsRaw === "string") {
    const n = servingsRaw.match(/(\d+)/);
    if (n) servings = Number(n[1]);
  }

  return {
    title: stripHtml(String(data.name || "Рецепт без назви")).slice(0, 160),
    description: stripHtml(String(data.description || `Імпортовано з ${host}`)).slice(0, 500),
    sourceUrl: url,
    imageUrl,
    cookTimeMinutes: parseDurationMinutes(
      (data.totalTime as string) || (data.cookTime as string) || (data.prepTime as string),
    ),
    servings,
    ingredients:
      ingredients.length > 0
        ? ingredients
        : [{ name: "Див. джерело", amount: 1, unit: "порція", aisle: "other" }],
    steps: (() => {
      const steps = instructionsToSteps(data.recipeInstructions);
      return steps.length
        ? steps
        : [{ order: 1, text: "Відкрийте джерело та виконайте кроки приготування." }];
    })(),
    host,
    warnings: [],
  };
}

function fromScraperResult(
  raw: Record<string, unknown>,
  url: string,
  host: string,
): ExtractedRecipe {
  const ingredients = ingredientsFromTrustedLines(
    asArray(raw.recipeIngredients as string[] | undefined).map(String),
  );
  const steps = instructionsToSteps(raw.recipeInstructions);
  const image = raw.image;
  const imageUrl = Array.isArray(image)
    ? String(image[0] ?? "")
    : typeof image === "string"
      ? image
      : undefined;

  return {
    title: String(raw.name || "Рецепт").slice(0, 160),
    description: stripHtml(String(raw.description || `Імпортовано з ${host}`)).slice(0, 500),
    sourceUrl: url,
    imageUrl: imageUrl || undefined,
    cookTimeMinutes: parseDurationMinutes(
      String(raw.totalTime || raw.cookTime || raw.prepTime || "30"),
    ),
    servings: (() => {
      const y = raw.recipeYield;
      if (typeof y === "number") return y;
      const n = String(y ?? "4").match(/(\d+)/);
      return n ? Number(n[1]) : 4;
    })(),
    ingredients:
      ingredients.length > 0
        ? ingredients
        : [{ name: "Див. джерело", amount: 1, unit: "порція", aisle: "other" }],
    steps:
      steps.length > 0
        ? steps
        : [{ order: 1, text: "Відкрийте джерело та виконайте кроки приготування." }],
    host,
    warnings: [],
  };
}

function isJunkLine(line: string): boolean {
  return isChromeIngredient(line);
}

function isGarbageRecipe(recipe: ExtractedRecipe): boolean {
  const title = recipe.title.toLowerCase();
  if (/^title:\s*/i.test(recipe.title)) return true;
  if (/url source|markdown content|skip to (content|recipe)/i.test(title)) return true;
  return false;
}

function ingredientScore(recipe: ExtractedRecipe): number {
  const withQty = recipe.ingredients.filter(hasQuantitySignal).length;
  let score = withQty * 4 + Math.min(recipe.ingredients.length, 15);
  if (recipe.ingredients.length >= 5 && withQty === 0) score -= 40;
  return score;
}

function stepScore(recipe: ExtractedRecipe): number {
  return recipe.steps.filter((s) => s.text.length > 20).length * 3;
}

function scoreRecipe(recipe: ExtractedRecipe): number {
  if (isGarbageRecipe(recipe)) return 0;
  let score = 0;
  if (recipe.title.length > 3 && !/^рецепт з /i.test(recipe.title)) score += 2;
  if (/\bvideo\b/i.test(recipe.title)) score -= 4;
  score += ingredientScore(recipe);
  score += stepScore(recipe);
  if (recipe.ingredients.filter(hasQuantitySignal).length >= 3) score += 8;
  if (recipe.steps.length >= 3) score += 4;
  return score;
}

function isObviouslyNotStep(line: string): boolean {
  const t = stripHtml(line).replace(/^\d+[.)]\s*/, "").trim();
  if (t.length < 8) return true;
  if (t.length > 1200) return true;
  if (/^https?:\/\//i.test(t)) return true;
  if (
    /^(save recipe|print|share|rate this|advertisement|newsletter|subscribe|related recipes?|you may also|comments?|reviews?|nutrition|інгредієнти)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}

function sanitizeRecipe(recipe: ExtractedRecipe): ExtractedRecipe {
  // Trusted lists already cleaned; still run a light pass for heuristic candidates
  const trusted =
    recipe.ingredients.length >= 3 &&
    recipe.ingredients.filter(hasQuantitySignal).length >= Math.min(3, recipe.ingredients.length);
  const ingredients = trusted
    ? recipe.ingredients
        .map((i) => ({ ...i, name: i.name.trim() }))
        .filter((i) => i.name && !isChromeIngredient(i.name))
    : filterIngredientObjects(recipe.ingredients);

  const steps = recipe.steps
    .map((s) => ({
      ...s,
      text: stripHtml(s.text)
        .replace(/^\d+[.)]\s*/, "")
        .replace(/^\[([^\]]+)\]\([^)]+\)\s*/g, "$1 ")
        .trim(),
    }))
    .filter((s) => s.text && !isObviouslyNotStep(s.text));

  return {
    ...recipe,
    title: recipe.title.replace(/^Title:\s*/i, "").trim() || recipe.title,
    ingredients:
      ingredients.length > 0
        ? ingredients
        : [{ name: "Додайте інгредієнти", amount: 1, unit: "", aisle: "other" }],
    steps:
      steps.length > 0
        ? steps.map((s, i) => ({ ...s, order: i + 1 }))
        : [{ order: 1, text: "Доповніть кроки приготування." }],
  };
}

/** Compose the strongest ingredients + steps across extractors. */
function pickBest(candidates: ExtractedRecipe[]): ExtractedRecipe | null {
  const cleaned = candidates
    .map(sanitizeRecipe)
    .map((r) => ({ r, score: scoreRecipe(r) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!cleaned.length) return null;

  const bestOverall = cleaned[0].r;
  const bestIngredients = [...cleaned].sort(
    (a, b) => ingredientScore(b.r) - ingredientScore(a.r),
  )[0].r;
  const bestSteps = [...cleaned].sort((a, b) => stepScore(b.r) - stepScore(a.r))[0].r;

  const warnings = Array.from(
    new Set([
      ...bestOverall.warnings,
      ...bestIngredients.warnings,
      ...bestSteps.warnings,
    ]),
  );

  return sanitizeRecipe({
    ...bestOverall,
    ingredients: bestIngredients.ingredients,
    steps: bestSteps.steps,
    imageUrl: bestOverall.imageUrl || bestIngredients.imageUrl || bestSteps.imageUrl,
    warnings,
  });
}

function heuristicExtract(html: string, url: string, host: string): ExtractedRecipe {
  const title =
    metaContent(html, "og:title") ||
    metaContent(html, "twitter:title") ||
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ||
    `Рецепт з ${host}`;

  const description =
    metaContent(html, "og:description") ||
    metaContent(html, "description") ||
    `Імпортовано з ${host}`;

  const imageUrl = metaContent(html, "og:image") || metaContent(html, "twitter:image");

  const ingredientBlocks = [
    ...html.matchAll(
      /<(?:ul|ol|div)[^>]*(?:ingredient|wprm-recipe-ingredient|tasty-recipes-ingredients)[^>]*>([\s\S]*?)<\/(?:ul|ol|div)>/gi,
    ),
  ];
  const stepBlocks = [
    ...html.matchAll(
      /<(?:ul|ol|div)[^>]*(?:instruction|direction|wprm-recipe-instruction|tasty-recipes-instructions|method)[^>]*>([\s\S]*?)<\/(?:ul|ol|div)>/gi,
    ),
  ];

  const liFrom = (blocks: RegExpMatchArray[]) =>
    blocks
      .flatMap((b) => [...b[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)])
      .map((m) => stripHtml(m[1]))
      .filter((t) => t.length > 1 && t.length < 300 && !isJunkLine(t));

  let ingredients = filterIngredientObjects(liFrom(ingredientBlocks).map(parseIngredientLine));
  const steps = liFrom(stepBlocks)
    .filter((t) => t.length > 3 && t.length < 400 && !isChromeIngredient(t))
    .slice(0, 40)
    .map((text, i) => ({ order: i + 1, text }));

  // Only scan global <li> if we found nothing in ingredient-specific blocks —
  // and only keep lines that look measured (avoids nav menus).
  if (ingredients.length === 0) {
    const listBlocks = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((m) => stripHtml(m[1]))
      .filter((t) => t.length > 2 && t.length < 120 && looksMeasuredLine(t));
    ingredients = filterIngredientObjects(listBlocks.map(parseIngredientLine)).slice(0, 25);
  }

  return {
    title: stripHtml(String(title)).slice(0, 160),
    description: stripHtml(description).slice(0, 500),
    sourceUrl: url,
    imageUrl: imageUrl?.startsWith("//") ? `https:${imageUrl}` : imageUrl,
    cookTimeMinutes: 30,
    servings: 4,
    ingredients:
      ingredients.length > 0
        ? ingredients
        : [{ name: "Додайте інгредієнти з джерела", amount: 1, unit: "порція", aisle: "other" }],
    steps:
      steps.length > 0
        ? steps
        : [{ order: 1, text: "Перевірте джерело й доповніть кроки вручну." }],
    host,
    warnings:
      ingredients.length && steps.length
        ? []
        : ["Частково розпізнано — перевірте картку перед збереженням."],
  };
}

/** Parse Jina-style readable markdown into a recipe (best effort). */
function parseReadableMarkdown(text: string, url: string, host: string): ExtractedRecipe | null {
  const titleFromMeta = text.match(/^Title:\s*(.+)$/im)?.[1]?.trim();
  let body = text
    .replace(/^Title:.*$/im, "")
    .replace(/^URL Source:.*$/gim, "")
    .replace(/^Published Time:.*$/gim, "")
    .replace(/^Warning:.*$/gim, "")
    .replace(/^Markdown Content:\s*/im, "")
    .trim();

  // Drop leading navigation / site chrome lines
  const lines = body.split(/\r?\n/).map((l) => l.trim());
  const startIdx = lines.findIndex(
    (l) =>
      l &&
      !isJunkLine(l) &&
      !/^\[[^\]]+\]\([^)]+\)/.test(l) &&
      (l.startsWith("#") || l.length > 8),
  );
  body = (startIdx >= 0 ? lines.slice(startIdx) : lines).join("\n");

  const titleFromH1 = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const title = (titleFromMeta || titleFromH1 || `Рецепт з ${host}`)
    .replace(/^Title:\s*/i, "")
    .slice(0, 160);

  const ingMatch = body.match(
    /(?:^|\n)\s*(?:#{1,3}\s*)?(?:\*\*)?(?:ingredients?|інгредієнти|склад)(?:\*\*)?\s*:?\s*\n([\s\S]*?)(?=\n\s*(?:#{1,3}\s*)?(?:\*\*)?(?:instructions?|directions?|method|steps?|preparation|nutrition|notes|tips|equipment|related|comments?|reviews?|you may also|more recipes|приготування|кроки|спосіб|харчов)(?:\*\*)?\b|$)/i,
  );
  const stepMatch = body.match(
    /(?:^|\n)\s*(?:#{1,3}\s*)?(?:\*\*)?(?:instructions?|directions?|method|steps?|preparation|приготування|кроки|спосіб)(?:\*\*)?\s*:?\s*\n([\s\S]*?)(?=\n\s*(?:#{1,3}\s*)?(?:\*\*)?(?:nutrition|notes|tips|ingredients?|related|comments?|reviews?|equipment|інгредієнти|харчов)\b|$)/i,
  );

  let ingredients: Ingredient[] = [];
  let steps: RecipeStep[] = [];

  if (ingMatch) {
    ingredients = filterIngredientObjects(ingMatch[1].split("\n").map(parseIngredientLine));
  }

  if (stepMatch) {
    steps = stepMatch[1]
      .split("\n")
      .map((l) => l.replace(/^[-*•]\s*/, "").replace(/^\d+[.)]\s*/, "").trim())
      .filter((l) => l && !/^#{1,3}/.test(l) && !isJunkLine(l) && l.length > 3 && l.length < 400)
      .slice(0, 30)
      .map((text, i) => ({ order: i + 1, text }));
  }

  // Fallback only inside a narrow window near the first "Ingredients" mention — never whole page
  if (ingredients.length < 2) {
    const idx = body.search(/(?:ingredients?|інгредієнти|склад)\s*:?/i);
    if (idx >= 0) {
      const window = body.slice(idx, idx + 2500);
      const stop = window.search(
        /\n\s*(?:#{1,3}\s*)?(?:instructions?|directions?|method|steps?|preparation|приготування|кроки)\b/i,
      );
      const chunk = stop > 0 ? window.slice(0, stop) : window;
      ingredients = filterIngredientObjects(chunk.split("\n").map(parseIngredientLine));
    }
  }

  if (steps.length < 2) {
    const idx = body.search(
      /(?:instructions?|directions?|method|steps?|preparation|приготування|кроки)\s*:?/i,
    );
    if (idx >= 0) {
      const window = body.slice(idx, idx + 4000);
      const numbered = window
        .split("\n")
        .map((l) => l.replace(/^\d+[.)]\s+/, "").replace(/^[-*•]\s+/, "").trim())
        .filter((l) => l.length > 15 && l.length < 400 && !isJunkLine(l))
        .slice(0, 25);
      if (numbered.length >= 2) {
        steps = numbered.map((text, i) => ({ order: i + 1, text }));
      }
    }
  }

  // Do NOT scrape random bullets from the whole page — that pulls unrelated site text.

  const recipe = sanitizeRecipe({
    title,
    description: `Імпортовано з ${host}`,
    sourceUrl: url,
    imageUrl:
      "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=1200&q=80",
    cookTimeMinutes: 30,
    servings: 4,
    ingredients,
    steps,
    host,
    warnings: [
      "Сайт обмежує прямий доступ — зібрано через альтернативний перегляд. Перевірте й підправте поля.",
    ],
  });

  return scoreRecipe(recipe) > 0 ? recipe : null;
}

async function fetchHtml(url: string, userAgent?: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          userAgent ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchViaArchive(url: string): Promise<string | null> {
  const stamps = ["20240615000000", "20240101000000", "20230701000000", "20250101000000"];
  for (const stamp of stamps) {
    try {
      const html = await fetchHtml(`https://web.archive.org/web/${stamp}/${url}`);
      if (html.includes("application/ld+json") && html.length > 8000) return html;
    } catch {
      /* next stamp */
    }
  }
  return null;
}

async function fetchViaJina(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(`https://r.jina.ai/${url}`, {
        signal: controller.signal,
        headers: {
          Accept: "text/plain",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "X-Return-Format": "markdown",
        },
      });
      if (!res.ok) return null;
      const text = await res.text();
      return text.trim().length > 120 ? text : null;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

function extractFromHtml(html: string, url: string, host: string): ExtractedRecipe | null {
  const candidates: ExtractedRecipe[] = [];
  const jsonLd = extractJsonLdRecipes(html);
  if (jsonLd[0]) {
    const recipe = fromJsonLd(jsonLd[0], url, host);
    if (!recipe.imageUrl) recipe.imageUrl = metaContent(html, "og:image");
    candidates.push(recipe);
  }
  candidates.push(heuristicExtract(html, url, host));
  return pickBest(candidates);
}

export async function extractRecipeFromUrl(url: string): Promise<ExtractedRecipe> {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error("Некоректне посилання");
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("Підтримуються лише http/https посилання");
  }

  if (parsed.hostname === "m.facebook.com") parsed.hostname = "www.facebook.com";
  const host = parsed.hostname.replace(/^www\./, "");
  const finalUrl = parsed.toString();
  const candidates: ExtractedRecipe[] = [];

  if (/instagram\.com|facebook\.com|fb\.com|fb\.watch|tiktok\.com|vm\.tiktok\.com/.test(host)) {
    const readable = await fetchViaJina(finalUrl);
    if (readable) {
      const parsedMd = parseReadableMarkdown(readable, finalUrl, host);
      if (parsedMd) return parsedMd;
    }
    return {
      title: `Рецепт з ${host}`,
      description:
        "Соцмережа обмежує авточитання. Скопіюйте текст допису у вкладку «З тексту». Посилання збережено.",
      sourceUrl: finalUrl,
      imageUrl:
        "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=1200&q=80",
      cookTimeMinutes: 30,
      servings: 4,
      ingredients: [
        { name: "Додайте інгредієнти з допису", amount: 1, unit: "порція", aisle: "other" },
      ],
      steps: [
        { order: 1, text: "Відкрийте джерело." },
        { order: 2, text: "Вставте текст у «Додати → З тексту»." },
      ],
      host,
      warnings: ["Для Instagram/Facebook надійніше вставити текст допису вручну."],
    };
  }

  // 1) Schema scraper
  try {
    const scraped = (await recipeDataScraper(finalUrl)) as Record<string, unknown>;
    candidates.push(fromScraperResult(scraped, finalUrl, host));
  } catch {
    /* continue */
  }

  // 2) Direct HTML
  for (const ua of [
    undefined,
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  ]) {
    try {
      const html = await fetchHtml(finalUrl, ua);
      const recipe = extractFromHtml(html, finalUrl, host);
      if (recipe) candidates.push(recipe);
    } catch {
      /* next */
    }
  }

  const bestSoFar = pickBest(candidates);
  if (bestSoFar && scoreRecipe(bestSoFar) >= 8) return bestSoFar;

  // 3) Archive
  try {
    const archived = await fetchViaArchive(finalUrl);
    if (archived) {
      const recipe = extractFromHtml(archived, finalUrl, host);
      if (recipe) {
        candidates.push({
          ...recipe,
          warnings: [
            ...recipe.warnings,
            "Сторінку прочитано через архівний знімок — перевірте актуальність.",
          ],
        });
      }
    }
  } catch {
    /* continue */
  }

  // 4) Readable proxy — always try; return best effort even if imperfect
  const readable = await fetchViaJina(finalUrl);
  if (readable) {
    const parsedMd = parseReadableMarkdown(readable, finalUrl, host);
    if (parsedMd) candidates.push(parsedMd);
  }

  const best = pickBest(candidates);
  if (best) {
    if (scoreRecipe(best) < 8) {
      best.warnings = [
        ...best.warnings,
        "Імпорт частковий — перевірте інгредієнти та кроки перед збереженням.",
      ];
    }
    return best;
  }

  // Last resort: at least keep title from reader / host and open the editor
  const fallbackTitle =
    readable?.match(/^Title:\s*(.+)$/im)?.[1]?.trim() ||
    readable?.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
    `Рецепт з ${host}`;

  return {
    title: fallbackTitle.replace(/^Title:\s*/i, "").slice(0, 160),
    description:
      "Автоімпорт отримав мало структурованих даних. Посилання збережено — доповніть інгредієнти та кроки (або вставте текст у «З тексту»).",
    sourceUrl: finalUrl,
    imageUrl:
      "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=1200&q=80",
    cookTimeMinutes: 30,
    servings: 4,
    ingredients: [{ name: "Додайте інгредієнти", amount: 1, unit: "порція", aisle: "other" }],
    steps: [{ order: 1, text: "Доповніть кроки приготування." }],
    host,
    warnings: [
      "Сторінка обмежує ботів, тож картка майже порожня. Найкраще: скопіювати рецепт у «З тексту».",
    ],
  };
}
