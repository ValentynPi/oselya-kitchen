import recipeDataScraper from "recipe-data-scraper";
import { guessAisle } from "@/lib/ai";
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
    .map((s) => s.trim())
    .filter((s) => looksLikeIngredient(s))
    .map(parseIngredientLine);

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
    .map((s) => s.trim())
    .filter((s) => looksLikeIngredient(s))
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

  const badIng = recipe.ingredients.filter((i) => !looksLikeIngredient(i.name)).length;
  if (
    recipe.ingredients.length > 0 &&
    badIng >= Math.max(1, Math.floor(recipe.ingredients.length * 0.4))
  ) {
    return true;
  }

  const badSteps = recipe.steps.filter((s) =>
    /https?:\/\/|^\[[^\]]+\]\([^)]+\)$|url source|markdown content|jump to recipe/i.test(
      s.text,
    ),
  ).length;
  if (recipe.steps.length > 0 && badSteps >= Math.max(1, Math.floor(recipe.steps.length * 0.3))) {
    return true;
  }

  return false;
}

function isJunkLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 2 || t.length > 400) return true;
  if (/^https?:\/\//i.test(t)) return true;
  if (/^\[[^\]]+\]\([^)]+\)$/.test(t)) return true;
  if (
    /^(url source|markdown content|title|published time|warning|skip to|jump to|save recipe|print|share|rate|advertisement|newsletter|subscribe|sign in|log in|cookie)\b/i.test(
      t,
    )
  )
    return true;
  if (/all rights reserved|©|terms of (use|service)|privacy policy/i.test(t)) return true;
  return false;
}

/** True for real grocery/ingredient lines; false for website chrome and misc text. */
function looksLikeIngredient(line: string): boolean {
  const t = line
    .replace(/^[-*•]\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/\[[^\]]*\]\([^)]*\)/g, "")
    .trim();

  if (t.length < 2 || t.length > 120) return false;
  if (isJunkLine(t)) return false;

  // Section headers / site chrome leaking into the list
  if (
    /^(ingredients?|instructions?|directions?|method|steps?|preparation|nutrition|notes?|tips?|equipment|tools|related|comments?|reviews?|you may also|more recipes|servings?|prep time|cook time|total time|yield|calories|author|category|cuisine|keywords|інгредієнти|приготування|кроки|опис|порції|час)\b/i.test(
      t,
    )
  ) {
    return false;
  }

  if (
    /\b(click here|read more|see also|photo by|recipe by|sponsored|affiliate|newsletter|facebook|instagram|pinterest|twitter|tiktok|watch (the )?video|leave a comment|write a review|jump to|print recipe|save recipe|pin it|share on)\b/i.test(
      t,
    )
  ) {
    return false;
  }

  // Ratings / times / nutrition facts as standalone lines
  if (/^\d+(\.\d+)?\s*(stars?|ratings?|reviews?|kcal|calories|мин|хв|min|minutes?|hours?|год)\b/i.test(t)) {
    return false;
  }
  if (/^(prep|cook|total|active)\s*time\b/i.test(t)) return false;
  if (/^\d+\s*(people|servings?|порц)/i.test(t) && !/[a-zа-я]/i.test(t.replace(/^\d+\s*(people|servings?|порц)\w*/i, ""))) {
    return false;
  }

  // Pure markdown headings leftover
  if (/^#{1,6}\s+/.test(t)) return false;

  // Paragraph-like instructions (too sentence-y for an ingredient)
  const words = t.split(/\s+/).length;
  if (words > 14 && /[.!?].*[a-zа-я]/i.test(t)) return false;
  if (words > 18) return false;

  // Prefer lines that look like measured ingredients, or short food names
  const hasMeasure =
    /^[\d¼½¾⅓⅔⅛⅜⅝⅞./\-\s]+/.test(t) ||
    /\d/.test(t) ||
    /\b(g|kg|ml|l|oz|lb|lbs|cup|cups|tsp|tbsp|teaspoon|tablespoon|pinch|clove|cloves|slice|slices|can|cans|package|pack|шт|г|кг|мл|л|ч\.?\s*л|ст\.?\s*л|склянк|зубчик|пучок|дрібк)\b/i.test(
      t,
    );

  const hasDashAmount = /\s+[—–-]\s*[\d¼½¾]/.test(t);

  if (hasMeasure || hasDashAmount) return true;

  // Short unmeasured items like "salt", "olive oil", "часник" — allow only if concise
  if (words <= 5 && !/[.!?]/.test(t) && /[a-zа-яіїєґ]/i.test(t)) return true;

  return false;
}

function filterIngredientLines(lines: string[]): string[] {
  const out: string[] = [];
  let consecutiveBad = 0;

  for (const raw of lines) {
    const line = raw
      .replace(/^[-*•]\s*/, "")
      .replace(/^\d+[.)]\s*/, "")
      .replace(/\[[^\]]*\]\([^)]*\)/g, "")
      .trim();
    if (!line || /^#{1,6}/.test(line)) {
      // Heading inside list usually means the ingredients block ended
      if (out.length >= 2) break;
      continue;
    }
    if (
      /^(instructions?|directions?|method|steps?|preparation|nutrition|notes?|tips?|related|comments?|reviews?|you may also|приготування|кроки|спосіб)\b/i.test(
        line,
      )
    ) {
      break;
    }
    if (!looksLikeIngredient(line)) {
      consecutiveBad += 1;
      // After we already have a solid list, stop on noise
      if (out.length >= 3 && consecutiveBad >= 2) break;
      continue;
    }
    consecutiveBad = 0;
    out.push(line);
    if (out.length >= 40) break;
  }

  return out;
}

function scoreRecipe(recipe: ExtractedRecipe): number {
  if (isGarbageRecipe(recipe)) return 0;
  let score = 0;
  if (recipe.title.length > 3 && !/^рецепт з /i.test(recipe.title)) score += 2;
  const goodIngs = recipe.ingredients.filter((i) => looksLikeIngredient(i.name)).length;
  score += Math.min(goodIngs, 12);
  score += Math.min(recipe.steps.length, 10);
  // Penalize noisy ingredient lists
  score -= Math.max(0, recipe.ingredients.length - goodIngs) * 2;
  if (goodIngs >= 3) score += 3;
  if (recipe.steps.length >= 3) score += 3;
  return score;
}

function sanitizeRecipe(recipe: ExtractedRecipe): ExtractedRecipe {
  const title = recipe.title.replace(/^Title:\s*/i, "").trim();
  const ingredientLines = filterIngredientLines(
    recipe.ingredients.map((i) => i.name.replace(/^[-*•]\s*/, "").trim()),
  );
  const ingredients = ingredientLines.map(parseIngredientLine);

  const steps = recipe.steps
    .map((s) => ({
      ...s,
      text: s.text
        .replace(/^\d+[.)]\s*/, "")
        .replace(/^\[([^\]]+)\]\([^)]+\)\s*/g, "$1 ")
        .trim(),
    }))
    .filter((s) => s.text && !isJunkLine(s.text) && s.text.length > 3 && s.text.length < 500);

  return {
    ...recipe,
    title: title || recipe.title,
    ingredients:
      ingredients.length > 0
        ? ingredients
        : [{ name: "Додайте інгредієнти", amount: 1, unit: "порція", aisle: "other" }],
    steps:
      steps.length > 0
        ? steps.map((s, i) => ({ ...s, order: i + 1 }))
        : [{ order: 1, text: "Доповніть кроки приготування." }],
  };
}

function pickBest(candidates: ExtractedRecipe[]): ExtractedRecipe | null {
  const ranked = candidates
    .map(sanitizeRecipe)
    .map((r) => ({ r, score: scoreRecipe(r) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.r ?? null;
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

  let ingredients = filterIngredientLines(liFrom(ingredientBlocks)).map(parseIngredientLine);
  const steps = liFrom(stepBlocks)
    .filter((t) => t.length > 3 && t.length < 400 && !looksLikeIngredient(t))
    .slice(0, 40)
    .map((text, i) => ({ order: i + 1, text }));

  // Only scan global <li> if we found nothing in ingredient-specific blocks —
  // and still require looksLikeIngredient + stop on noise.
  if (ingredients.length === 0) {
    const listBlocks = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((m) => stripHtml(m[1]))
      .filter((t) => t.length > 2 && t.length < 120);
    ingredients = filterIngredientLines(listBlocks).slice(0, 25).map(parseIngredientLine);
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
    ingredients = filterIngredientLines(ingMatch[1].split("\n")).map(parseIngredientLine);
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
      ingredients = filterIngredientLines(chunk.split("\n")).map(parseIngredientLine);
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
        .filter((l) => l.length > 15 && l.length < 400 && !isJunkLine(l) && !looksLikeIngredient(l))
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
