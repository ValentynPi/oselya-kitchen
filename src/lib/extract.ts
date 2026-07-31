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
  const iso = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
  if (iso) {
    const h = Number(iso[1] || 0);
    const m = Number(iso[2] || 0);
    return Math.max(1, h * 60 + m);
  }
  const digits = value.match(/(\d+)/);
  return digits ? Math.max(1, Number(digits[1])) : 30;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseIngredientLine(line: string): Ingredient {
  const cleaned = stripHtml(line).replace(/^[-•*]\s*/, "").trim();
  const match = cleaned.match(/^([\d.,/½¼¾⅓⅔]+)\s*([а-яА-Яa-zA-Z.]+)?\s+(.+)$/);
  if (match) {
    const amountRaw = match[1].replace(",", ".");
    const amount = Number(amountRaw) || 1;
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

function extractJsonLdRecipes(html: string): Record<string, unknown>[] {
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const found: Record<string, unknown>[] = [];

  for (const match of scripts) {
    try {
      const json = JSON.parse(match[1].trim());
      const nodes = asArray(json).flatMap((node) => {
        if (node && typeof node === "object" && "@graph" in node) {
          return asArray((node as { "@graph": unknown })["@graph"]);
        }
        return [node];
      });

      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const type = (node as { "@type"?: string | string[] })["@type"];
        const types = asArray(type).map(String);
        if (types.some((t) => t.toLowerCase() === "recipe")) {
          found.push(node as Record<string, unknown>);
        }
      }
    } catch {
      /* ignore bad JSON-LD */
    }
  }

  return found;
}

function fromJsonLd(data: Record<string, unknown>, url: string, host: string): ExtractedRecipe {
  const name = String(data.name || "Рецепт без назви");
  const description = stripHtml(String(data.description || `Імпортовано з ${host}`));
  const imageRaw = data.image;
  let imageUrl: string | undefined;
  if (typeof imageRaw === "string") imageUrl = imageRaw;
  else if (Array.isArray(imageRaw) && typeof imageRaw[0] === "string") imageUrl = imageRaw[0];
  else if (imageRaw && typeof imageRaw === "object" && "url" in imageRaw) {
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
          const obj = item as { text?: string; itemListElement?: unknown; name?: string };
          if (obj.itemListElement) {
            return asArray(obj.itemListElement).map((el) => {
              if (typeof el === "string") return stripHtml(el);
              if (el && typeof el === "object" && "text" in el) return stripHtml(String((el as { text: string }).text));
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
  else if (typeof servingsRaw === "string") {
    const n = servingsRaw.match(/(\d+)/);
    if (n) servings = Number(n[1]);
  }

  return {
    title: name,
    description,
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

function heuristicExtract(html: string, url: string, host: string): ExtractedRecipe {
  const title =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ||
    `Рецепт з ${host}`;

  const description =
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    `Імпортовано з ${host}. Перевірте й доповніть інгредієнти та кроки.`;

  const imageUrl =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];

  const listBlocks = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => stripHtml(m[1]))
    .filter((t) => t.length > 2 && t.length < 180);

  const ingredientLike = listBlocks.filter((t) =>
    /\d|г\b|мл\b|шт|ч\.?\s*л|ст\.?\s*л|cup|tsp|tbsp|oz|lb/i.test(t),
  );

  const ingredients = (ingredientLike.length ? ingredientLike : listBlocks)
    .slice(0, 20)
    .map(parseIngredientLine);

  return {
    title: stripHtml(title).slice(0, 120),
    description: stripHtml(description).slice(0, 400),
    sourceUrl: url,
    imageUrl,
    cookTimeMinutes: 30,
    servings: 4,
    ingredients:
      ingredients.length > 0
        ? ingredients
        : [{ name: "Додайте інгредієнти з джерела", amount: 1, unit: "порція", aisle: "other" }],
    steps: [
      {
        order: 1,
        text: "Сторінка не має структурованого рецепта — перевірте джерело й доповніть кроки вручну.",
      },
    ],
    host,
    warnings: [
      "Структурований рецепт не знайдено. Заповнено з метаданих сторінки — відредагуйте перед збереженням.",
    ],
  };
}

function socialStub(url: string, host: string): ExtractedRecipe {
  const isInstagram = /instagram/.test(host);
  const isFacebook = /facebook|fb\.com/.test(host);
  return {
    title: isInstagram
      ? "Рецепт з Instagram"
      : isFacebook
        ? "Рецепт з Facebook"
        : `Рецепт з ${host}`,
    description:
      "Соцмережі часто блокують авточитання. Заголовок і джерело збережено — додайте інгредієнти та кроки з допису вручну, або вставте текст нижче після імпорту.",
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
      { order: 2, text: "Скопіюйте інгредієнти та кроки в поля рецепта перед збереженням." },
    ],
    host,
    warnings: [
      "Instagram / Facebook обмежують парсинг. Посилання збережено — доповніть картку вручну.",
    ],
  };
}

export async function extractRecipeFromUrl(url: string): Promise<ExtractedRecipe> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Некоректне посилання");
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("Підтримуються лише http/https посилання");
  }

  const host = parsed.hostname.replace(/^www\./, "");

  if (/instagram\.com|facebook\.com|fb\.com|fb\.watch/.test(host)) {
    return socialStub(url, host);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; OselyaRecipeBot/1.0; +https://oselya.local)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      throw new Error(`Не вдалося відкрити сторінку (${res.status})`);
    }

    const html = await res.text();
    const jsonLd = extractJsonLdRecipes(html);
    if (jsonLd[0]) {
      const recipe = fromJsonLd(jsonLd[0], url, host);
      if (!recipe.imageUrl) {
        recipe.imageUrl =
          html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
      }
      return recipe;
    }

    return heuristicExtract(html, url, host);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Помилка завантаження";
    return {
      title: `Рецепт з ${host}`,
      description: `Не вдалося автоматично прочитати сторінку (${message}). Додайте дані вручну — посилання на джерело збережено.`,
      sourceUrl: url,
      imageUrl:
        "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=1200&q=80",
      cookTimeMinutes: 30,
      servings: 4,
      ingredients: [
        { name: "Додайте інгредієнти", amount: 1, unit: "порція", aisle: "other" },
      ],
      steps: [{ order: 1, text: "Опишіть кроки приготування." }],
      host,
      warnings: [message],
    };
  } finally {
    clearTimeout(timeout);
  }
}
