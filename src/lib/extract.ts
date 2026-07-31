import recipeDataScraper from "recipe-data-scraper";
import { guessAisle } from "@/lib/ai";
import { parseRecipeFromText } from "@/lib/parse-text";
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
  const cleaned = stripHtml(line).replace(/^[-•*]\s*/, "").trim();
  if (!cleaned) {
    return { name: "Інгредієнт", amount: 1, unit: "шт", aisle: "other" };
  }
  const match = cleaned.match(/^([\d.,/½¼¾⅓⅔]+)\s*([a-zA-Zа-яА-Я.]+)?\s+(.+)$/);
  if (match) {
    return {
      name: match[3].trim(),
      amount: Number(match[1].replace(",", ".")) || 1,
      unit: match[2] || "шт",
      aisle: guessAisle(match[3]),
    };
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
  return { name: cleaned, amount: 1, unit: "шт", aisle: guessAisle(cleaned) };
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

  const ingredients = asArray(data.recipeIngredient as string[] | string | undefined)
    .map(String)
    .map(parseIngredientLine)
    .filter((i) => i.name);

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
  const ingredients = asArray(raw.recipeIngredients as string[] | undefined)
    .map(String)
    .map(parseIngredientLine);
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

function isGarbageRecipe(recipe: ExtractedRecipe): boolean {
  const title = recipe.title.toLowerCase();
  if (/^title:\s*/i.test(recipe.title)) return true;
  if (/url source|markdown content|skip to (content|recipe)/i.test(title)) return true;

  const badIng = recipe.ingredients.filter((i) =>
    /url source|markdown|https?:\/\/|skip to|allrightsreserved|©|cookie settings|sign ?in|subscribe/i.test(
      i.name,
    ),
  ).length;
  if (badIng >= Math.max(1, Math.floor(recipe.ingredients.length * 0.3))) return true;

  const badSteps = recipe.steps.filter((s) =>
    /https?:\/\/|^\[[^\]]+\]\([^)]+\)|url source|markdown content|jump to recipe/i.test(s.text),
  ).length;
  if (badSteps >= Math.max(1, Math.floor(recipe.steps.length * 0.3))) return true;

  const weakIngredients =
    recipe.ingredients.length <= 1 &&
    /додайте|див\.|джерело|порція/i.test(recipe.ingredients[0]?.name ?? "");
  const weakSteps =
    recipe.steps.length <= 1 &&
    /джерело|вручну|доповніть|опишіть/i.test(recipe.steps[0]?.text ?? "");
  return weakIngredients && weakSteps;
}

function isQualityRecipe(recipe: ExtractedRecipe): boolean {
  return (
    !isGarbageRecipe(recipe) &&
    recipe.ingredients.length >= 2 &&
    recipe.steps.length >= 2 &&
    recipe.title.length > 2
  );
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
      .filter((t) => t.length > 1 && t.length < 300);

  let ingredients = liFrom(ingredientBlocks).slice(0, 40).map(parseIngredientLine);
  const steps = liFrom(stepBlocks)
    .slice(0, 40)
    .map((text, i) => ({ order: i + 1, text }));

  if (ingredients.length === 0) {
    const listBlocks = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((m) => stripHtml(m[1]))
      .filter((t) => t.length > 2 && t.length < 180);
    const ingredientLike = listBlocks.filter((t) =>
      /\d|г\b|кг|мл|л\b|шт|cup|tsp|tbsp|oz|lb|grams?/i.test(t),
    );
    ingredients = (ingredientLike.length ? ingredientLike : []).slice(0, 25).map(parseIngredientLine);
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

/** Parse Jina-style readable markdown into a recipe. */
function parseReadableMarkdown(text: string, url: string, host: string): ExtractedRecipe | null {
  const cleaned = text
    .replace(/^Title:\s*/im, "")
    .replace(/^URL Source:.*$/gim, "")
    .replace(/^Markdown Content:\s*/im, "")
    .replace(/^Published Time:.*$/gim, "")
    .replace(/^Warning:.*$/gim, "")
    .trim();

  // Prefer sections after "Ingredients" / "Instructions"
  const ingMatch = cleaned.match(
    /(?:^|\n)#{1,3}\s*ingredients?\b[^\n]*\n([\s\S]*?)(?=\n#{1,3}\s|\ninstructions?\b|\nmethod\b|\ndirections?\b|$)/i,
  );
  const stepMatch = cleaned.match(
    /(?:^|\n)#{1,3}\s*(?:instructions?|directions?|method|steps?)\b[^\n]*\n([\s\S]*?)(?=\n#{1,3}\s|$)/i,
  );

  if (ingMatch || stepMatch) {
    const titleLine =
      cleaned.split("\n").find((l) => l.trim() && !l.startsWith("#") && l.length < 120)?.trim() ||
      `Рецепт з ${host}`;
    const ingredients = (ingMatch?.[1] || "")
      .split("\n")
      .map((l) => l.replace(/^[-*•]\s*/, "").trim())
      .filter((l) => l && !/^#{1,3}/.test(l))
      .map(parseIngredientLine);
    const steps = (stepMatch?.[1] || "")
      .split("\n")
      .map((l) => l.replace(/^\d+[.)]\s*/, "").replace(/^[-*•]\s*/, "").trim())
      .filter((l) => l && !/^#{1,3}/.test(l) && l.length > 3)
      .map((text, i) => ({ order: i + 1, text }));

    const recipe: ExtractedRecipe = {
      title: titleLine.replace(/^#+\s*/, "").slice(0, 160),
      description: `Імпортовано з ${host}`,
      sourceUrl: url,
      cookTimeMinutes: 30,
      servings: 4,
      ingredients,
      steps,
      host,
      warnings: ["Отримано через читабельний перегляд — перевірте поля."],
    };
    return isQualityRecipe(recipe) ? recipe : null;
  }

  try {
    const parsed = parseRecipeFromText(cleaned);
    const recipe: ExtractedRecipe = { ...parsed, sourceUrl: url, host };
    return isQualityRecipe(recipe) ? recipe : null;
  } catch {
    return null;
  }
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
    const timeout = setTimeout(() => controller.abort(), 18000);
    try {
      const res = await fetch(`https://r.jina.ai/${url}`, {
        signal: controller.signal,
        headers: { Accept: "text/plain", "User-Agent": "OselyaRecipeBot/1.0" },
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

function socialStub(url: string, host: string): ExtractedRecipe {
  return {
    title: `Рецепт з ${host}`,
    description:
      "Цей сайт блокує авточитання. Скопіюйте текст рецепта і використайте вкладку «З тексту». Посилання збережено.",
    sourceUrl: url,
    imageUrl:
      "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=1200&q=80",
    cookTimeMinutes: 30,
    servings: 4,
    ingredients: [
      { name: "Додайте інгредієнти з допису", amount: 1, unit: "порція", aisle: "other" },
    ],
    steps: [
      { order: 1, text: "Відкрийте джерело." },
      { order: 2, text: "Вставте текст у «Додати → З тексту» або заповніть поля вручну." },
    ],
    host,
    warnings: ["Автоімпорт недоступний для цього посилання. Використайте «З тексту»."],
  };
}

function extractFromHtml(html: string, url: string, host: string): ExtractedRecipe | null {
  const jsonLd = extractJsonLdRecipes(html);
  if (jsonLd[0]) {
    const recipe = fromJsonLd(jsonLd[0], url, host);
    if (!recipe.imageUrl) recipe.imageUrl = metaContent(html, "og:image");
    if (isQualityRecipe(recipe)) return recipe;
    const heur = heuristicExtract(html, url, host);
    const merged: ExtractedRecipe = {
      ...recipe,
      ingredients: recipe.ingredients.length >= 2 ? recipe.ingredients : heur.ingredients,
      steps: recipe.steps.length >= 2 ? recipe.steps : heur.steps,
      imageUrl: recipe.imageUrl || heur.imageUrl,
      warnings: ["Дані зібрано з розмітки сторінки — перевірте перед збереженням."],
    };
    if (isQualityRecipe(merged)) return merged;
  }
  const heur = heuristicExtract(html, url, host);
  return isQualityRecipe(heur) ? heur : null;
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

  if (/instagram\.com|facebook\.com|fb\.com|fb\.watch|tiktok\.com|vm\.tiktok\.com/.test(host)) {
    const readable = await fetchViaJina(finalUrl);
    if (readable) {
      const parsedMd = parseReadableMarkdown(readable, finalUrl, host);
      if (parsedMd) return parsedMd;
    }
    return socialStub(finalUrl, host);
  }

  // 1) Dedicated recipe schema scraper (works on many major food sites)
  try {
    const scraped = (await recipeDataScraper(finalUrl)) as Record<string, unknown>;
    const recipe = fromScraperResult(scraped, finalUrl, host);
    if (isQualityRecipe(recipe)) return recipe;
  } catch {
    /* continue */
  }

  // 2) Direct HTML + JSON-LD / heuristics
  for (const ua of [
    undefined,
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  ]) {
    try {
      const html = await fetchHtml(finalUrl, ua);
      const recipe = extractFromHtml(html, finalUrl, host);
      if (recipe) return recipe;
    } catch {
      /* next */
    }
  }

  // 3) Wayback Machine snapshot (for bot-blocked sites)
  try {
    const archived = await fetchViaArchive(finalUrl);
    if (archived) {
      const recipe = extractFromHtml(archived, finalUrl, host);
      if (recipe) {
        return {
          ...recipe,
          warnings: [
            ...recipe.warnings,
            "Сторінку прочитано через архівний знімок — перевірте актуальність.",
          ],
        };
      }
    }
  } catch {
    /* continue */
  }

  // 4) Readable markdown proxy (only if it parses cleanly)
  const readable = await fetchViaJina(finalUrl);
  if (readable) {
    const parsedMd = parseReadableMarkdown(readable, finalUrl, host);
    if (parsedMd) return parsedMd;
  }

  return {
    title: `Рецепт з ${host}`,
    description:
      "Не вдалося коректно витягти рецепт із цього посилання. Скопіюйте текст зі сторінки та використайте вкладку «З тексту».",
    sourceUrl: finalUrl,
    imageUrl:
      "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=1200&q=80",
    cookTimeMinutes: 30,
    servings: 4,
    ingredients: [{ name: "Додайте інгредієнти", amount: 1, unit: "порція", aisle: "other" }],
    steps: [{ order: 1, text: "Вставте текст рецепта через «З тексту» або заповніть кроки вручну." }],
    host,
    warnings: [
      "Автоімпорт не зміг прочитати цю сторінку (сайт блокує ботів або немає структурованих даних). Найкращий спосіб — «З тексту».",
    ],
  };
}
