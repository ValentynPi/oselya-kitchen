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
    const h = Number(iso[1] || 0);
    const m = Number(iso[2] || 0);
    const s = Number(iso[3] || 0);
    return Math.max(1, h * 60 + m + Math.round(s / 60));
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

function repairJson(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/,\s*([}\]])/g, "$1");
}

function extractJsonLdRecipes(html: string): Record<string, unknown>[] {
  const scripts = [
    ...html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  const found: Record<string, unknown>[] = [];

  for (const match of scripts) {
    const raw = match[1].trim();
    const candidates = [raw, repairJson(raw)];
    for (const candidate of candidates) {
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
          const type = (node as { "@type"?: string | string[] })["@type"];
          const types = asArray(type).map((t) => String(t).toLowerCase());
          if (types.some((t) => t === "recipe" || t.endsWith("/recipe"))) {
            found.push(node as Record<string, unknown>);
          }
          // Some pages nest Recipe under mainEntity
          const main = (node as { mainEntity?: unknown }).mainEntity;
          for (const ent of asArray(main)) {
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
        /* try next candidate */
      }
    }
  }

  return found;
}

function extractMicrodata(html: string): Partial<ExtractedRecipe> | null {
  const hasRecipe = /itemtype=["'][^"']*Recipe["']/i.test(html);
  if (!hasRecipe) return null;

  const ingredients = [...html.matchAll(/itemprop=["']recipeIngredient["'][^>]*>([\s\S]*?)<\//gi)]
    .map((m) => stripHtml(m[1]))
    .filter(Boolean)
    .map(parseIngredientLine);

  const steps = [
    ...html.matchAll(/itemprop=["']recipeInstructions["'][^>]*>([\s\S]*?)<\//gi),
    ...html.matchAll(/itemprop=["']text["'][^>]*>([\s\S]*?)<\//gi),
  ]
    .map((m) => stripHtml(m[1]))
    .filter((t) => t.length > 5)
    .map((text, i) => ({ order: i + 1, text }));

  const name =
    html.match(/itemprop=["']name["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    html.match(/itemprop=["']name["'][^>]*>([\s\S]*?)<\//i)?.[1];

  if (ingredients.length === 0 && steps.length === 0) return null;

  return {
    title: name ? stripHtml(name).slice(0, 120) : undefined,
    ingredients: ingredients.length ? ingredients : undefined,
    steps: steps.length ? steps : undefined,
  };
}

function fromJsonLd(data: Record<string, unknown>, url: string, host: string): ExtractedRecipe {
  const name = String(data.name || "Рецепт без назви");
  const description = stripHtml(String(data.description || `Імпортовано з ${host}`));
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

  const instructionsRaw = data.recipeInstructions;
  let steps: RecipeStep[] = [];
  if (typeof instructionsRaw === "string") {
    steps = instructionsRaw
      .split(/\n+|(?<=\.)\s+(?=[A-ZА-ЯІЇЄҐ])/)
      .map(stripHtml)
      .filter(Boolean)
      .map((text, i) => ({ order: i + 1, text }));
  } else {
    steps = asArray(instructionsRaw as unknown[])
      .flatMap((item) => {
        if (!item) return [];
        if (typeof item === "string") return [stripHtml(item)];
        if (typeof item === "object") {
          const obj = item as {
            text?: string;
            itemListElement?: unknown;
            name?: string;
            "@type"?: string;
          };
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
    title: stripHtml(name).slice(0, 160),
    description: description.slice(0, 500),
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
    steps:
      steps.length > 0
        ? steps
        : [{ order: 1, text: "Відкрийте джерело та виконайте кроки приготування." }],
    host,
    warnings: [],
  };
}

function extractFromCommonSelectors(html: string): {
  ingredients: Ingredient[];
  steps: RecipeStep[];
} {
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

  const ingredients = liFrom(ingredientBlocks).slice(0, 40).map(parseIngredientLine);
  const steps = liFrom(stepBlocks)
    .slice(0, 40)
    .map((text, i) => ({ order: i + 1, text }));

  return { ingredients, steps };
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
    metaContent(html, "twitter:description") ||
    `Імпортовано з ${host}. Перевірте й доповніть інгредієнти та кроки.`;

  const imageUrl =
    metaContent(html, "og:image") ||
    metaContent(html, "twitter:image") ||
    html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)?.[1];

  const fromSelectors = extractFromCommonSelectors(html);
  const micro = extractMicrodata(html);

  let ingredients = fromSelectors.ingredients;
  let steps = fromSelectors.steps;

  if (micro?.ingredients?.length) ingredients = micro.ingredients;
  if (micro?.steps?.length) steps = micro.steps;

  if (ingredients.length === 0) {
    const listBlocks = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((m) => stripHtml(m[1]))
      .filter((t) => t.length > 2 && t.length < 180);
    const ingredientLike = listBlocks.filter((t) =>
      /\d|г\b|кг\b|мл\b|л\b|шт|ч\.?\s*л|ст\.?\s*л|cup|tsp|tbsp|oz|lb|grams?|ml\b/i.test(t),
    );
    ingredients = (ingredientLike.length ? ingredientLike : listBlocks.slice(0, 15)).map(
      parseIngredientLine,
    );
  }

  if (steps.length === 0) {
    const numbered = [...html.matchAll(/<(?:p|li|div)[^>]*>\s*\d+[.)]\s*([\s\S]*?)<\//gi)]
      .map((m) => stripHtml(m[1]))
      .filter((t) => t.length > 15)
      .slice(0, 20);
    if (numbered.length) {
      steps = numbered.map((text, i) => ({ order: i + 1, text }));
    }
  }

  const warnings: string[] = [];
  if (ingredients.length === 0 || steps.length <= 1) {
    warnings.push(
      "Структурований рецепт частково знайдено. Перевірте інгредієнти та кроки перед збереженням.",
    );
  }

  return {
    title: stripHtml(String(micro?.title || title)).slice(0, 160),
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
        : [
            {
              order: 1,
              text: "Сторінка не має повного рецепта — перевірте джерело й доповніть кроки вручну.",
            },
          ],
    host,
    warnings,
  };
}

function socialStub(url: string, host: string): ExtractedRecipe {
  const isInstagram = /instagram/.test(host);
  const isFacebook = /facebook|fb\.com/.test(host);
  const isTikTok = /tiktok/.test(host);
  return {
    title: isInstagram
      ? "Рецепт з Instagram"
      : isFacebook
        ? "Рецепт з Facebook"
        : isTikTok
          ? "Рецепт з TikTok"
          : `Рецепт з ${host}`,
    description:
      "Соцмережі часто блокують авточитання. Скопіюйте текст допису і використайте вкладку «З тексту» — або доповніть картку вручну. Посилання на джерело збережено.",
    sourceUrl: url,
    imageUrl:
      "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=1200&q=80",
    cookTimeMinutes: 30,
    servings: 4,
    ingredients: [
      { name: "Додайте інгредієнти з допису", amount: 1, unit: "порція", aisle: "other" },
    ],
    steps: [
      { order: 1, text: "Відкрийте оригінальний допис за посиланням джерела." },
      { order: 2, text: "Скопіюйте текст у «Додати → З тексту» або заповніть поля нижче." },
    ],
    host,
    warnings: [
      "Ця соцмережа обмежує парсинг. Найкраще: скопіювати текст допису у вкладку «З тексту».",
    ],
  };
}

function isWeakRecipe(recipe: ExtractedRecipe): boolean {
  const weakIngredients =
    recipe.ingredients.length <= 1 &&
    /додайте|див\.|джерело|порція/i.test(recipe.ingredients[0]?.name ?? "");
  const weakSteps =
    recipe.steps.length <= 1 &&
    /джерело|вручну|доповніть|опишіть/i.test(recipe.steps[0]?.text ?? "");
  return weakIngredients || weakSteps || recipe.warnings.length > 0;
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7,ru;q=0.6",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

/** Readable-content fallback for sites that block bots. */
async function fetchViaJina(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    try {
      const res = await fetch(`https://r.jina.ai/${url}`, {
        signal: controller.signal,
        headers: {
          Accept: "text/plain",
          "User-Agent": "OselyaRecipeBot/1.0",
        },
      });
      if (!res.ok) return null;
      const text = await res.text();
      return text.trim().length > 80 ? text : null;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

function recipeFromReadableText(
  text: string,
  url: string,
  host: string,
  extraWarning?: string,
): ExtractedRecipe {
  try {
    const parsed = parseRecipeFromText(text);
    return {
      ...parsed,
      sourceUrl: url,
      host,
      warnings: [
        ...(extraWarning ? [extraWarning] : []),
        ...parsed.warnings,
      ],
    };
  } catch {
    return {
      title: metaishTitle(text) || `Рецепт з ${host}`,
      description: text.slice(0, 300),
      sourceUrl: url,
      imageUrl:
        "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=1200&q=80",
      cookTimeMinutes: 30,
      servings: 4,
      ingredients: [{ name: "Додайте інгредієнти", amount: 1, unit: "порція", aisle: "other" }],
      steps: [{ order: 1, text: "Перевірте джерело і доповніть кроки." }],
      host,
      warnings: [extraWarning || "Не вдалося повністю розібрати сторінку."],
    };
  }
}

function metaishTitle(text: string): string | null {
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 3 && l.length < 120 && !/^https?:/i.test(l));
  return line ?? null;
}

function htmlToRoughText(html: string): string {
  return stripHtml(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h1|h2|h3|tr)>/gi, "\n"),
  )
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 12000);
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

  // Normalize mobile / short hosts
  if (parsed.hostname === "m.facebook.com") parsed.hostname = "www.facebook.com";
  if (parsed.hostname === "m.youtube.com") parsed.hostname = "www.youtube.com";

  const host = parsed.hostname.replace(/^www\./, "");
  const finalUrl = parsed.toString();

  if (/instagram\.com|facebook\.com|fb\.com|fb\.watch|tiktok\.com|vm\.tiktok\.com/.test(host)) {
    // Still try Jina — sometimes returns caption text
    const readable = await fetchViaJina(finalUrl);
    if (readable && readable.length > 120) {
      const fromText = recipeFromReadableText(
        readable,
        finalUrl,
        host,
        "Отримано через читабельний перегляд. Перевірте поля.",
      );
      if (!isWeakRecipe(fromText)) return fromText;
    }
    return socialStub(finalUrl, host);
  }

  let html = "";
  let fetchError = "";
  try {
    html = await fetchHtml(finalUrl);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "fetch failed";
  }

  if (html) {
    const jsonLd = extractJsonLdRecipes(html);
    if (jsonLd[0]) {
      const recipe = fromJsonLd(jsonLd[0], finalUrl, host);
      if (!recipe.imageUrl) {
        recipe.imageUrl = metaContent(html, "og:image");
      }
      if (!isWeakRecipe(recipe)) return recipe;

      // Enrich weak JSON-LD with heuristics
      const heur = heuristicExtract(html, finalUrl, host);
      return {
        ...recipe,
        ingredients:
          recipe.ingredients.length > 1 ? recipe.ingredients : heur.ingredients,
        steps: recipe.steps.length > 1 ? recipe.steps : heur.steps,
        imageUrl: recipe.imageUrl || heur.imageUrl,
        warnings: [
          ...recipe.warnings,
          "Частину даних доповнено з розмітки сторінки — перевірте перед збереженням.",
        ],
      };
    }

    const heur = heuristicExtract(html, finalUrl, host);
    if (!isWeakRecipe(heur)) return heur;

    // Last try on page text
    const rough = htmlToRoughText(html);
    if (rough.length > 100) {
      const fromText = recipeFromReadableText(rough, finalUrl, host);
      if (!isWeakRecipe(fromText)) {
        return {
          ...fromText,
          title: heur.title || fromText.title,
          imageUrl: heur.imageUrl || fromText.imageUrl,
          description: heur.description || fromText.description,
        };
      }
    }
  }

  // External readable proxy (helps with bot-blocked recipe sites)
  const readable = await fetchViaJina(finalUrl);
  if (readable) {
    return recipeFromReadableText(
      readable,
      finalUrl,
      host,
      fetchError
        ? `Пряме читання не вдалося (${fetchError}), використано альтернативний перегляд.`
        : "Отримано через альтернативний перегляд сторінки — перевірте поля.",
    );
  }

  if (html) {
    return heuristicExtract(html, finalUrl, host);
  }

  return {
    title: `Рецепт з ${host}`,
    description: `Не вдалося автоматично прочитати сторінку${fetchError ? ` (${fetchError})` : ""}. Додайте дані вручну або вставте текст у вкладці «З тексту».`,
    sourceUrl: finalUrl,
    imageUrl:
      "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=1200&q=80",
    cookTimeMinutes: 30,
    servings: 4,
    ingredients: [{ name: "Додайте інгредієнти", amount: 1, unit: "порція", aisle: "other" }],
    steps: [{ order: 1, text: "Опишіть кроки приготування." }],
    host,
    warnings: [fetchError || "Сторінку не вдалося прочитати"],
  };
}
