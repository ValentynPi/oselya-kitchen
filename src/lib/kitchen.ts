import type {
  Ingredient,
  MealPlanEntry,
  Recipe,
  ShoppingItem,
  StoreAisle,
} from "./types";
import { guessAisle } from "./ai";

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export function scaleIngredients(ingredients: Ingredient[], from: number, to: number): Ingredient[] {
  const factor = to / Math.max(from, 1);
  return ingredients.map((i) => ({
    ...i,
    amount: Math.round(i.amount * factor * 100) / 100,
  }));
}

export function buildShoppingList(
  plan: MealPlanEntry[],
  recipes: Recipe[],
  extras: ShoppingItem[] = [],
): ShoppingItem[] {
  const map = new Map<string, ShoppingItem>();

  for (const entry of plan) {
    const recipe = recipes.find((r) => r.id === entry.recipeId);
    if (!recipe) continue;
    const scaled = scaleIngredients(recipe.ingredients, recipe.servings, entry.servings);
    for (const ing of scaled) {
      const key = `${normalizeName(ing.name)}|${ing.unit}`;
      const existing = map.get(key);
      if (existing) {
        existing.amount = Math.round((existing.amount + ing.amount) * 100) / 100;
      } else {
        map.set(key, {
          id: `shop-${key}`,
          name: ing.name,
          amount: ing.amount,
          unit: ing.unit,
          aisle: ing.aisle ?? guessAisle(ing.name),
          checked: false,
          fromRecipes: true,
        });
      }
    }
  }

  const fromPlan = [...map.values()];
  return [...fromPlan, ...extras.filter((e) => !e.fromRecipes)];
}

export const AISLE_LABELS: Record<StoreAisle, string> = {
  produce: "Овочі та фрукти",
  meat: "М'ясо та риба",
  dairy: "Молочні",
  bakery: "Хлібний відділ",
  pantry: "Бакалія",
  frozen: "Заморозка",
  other: "Інше",
};

export interface IngredientMatch {
  recipe: Recipe;
  kind: "exact" | "partial";
  missing: string[];
  matched: string[];
  coverage: number;
}

export function matchByIngredients(
  recipes: Recipe[],
  available: string[],
): IngredientMatch[] {
  const have = available.map(normalizeName).filter(Boolean);
  if (have.length === 0) return [];

  return recipes
    .map((recipe) => {
      const names = recipe.ingredients.map((i) => normalizeName(i.name));
      const matched = names.filter((n) => have.some((h) => n.includes(h) || h.includes(n)));
      const missing = recipe.ingredients
        .filter((i) => !have.some((h) => normalizeName(i.name).includes(h) || h.includes(normalizeName(i.name))))
        .map((i) => i.name);
      const coverage = matched.length / Math.max(names.length, 1);
      const kind: "exact" | "partial" = missing.length === 0 ? "exact" : "partial";
      return { recipe, kind, missing, matched, coverage };
    })
    .filter((m) => m.coverage >= 0.5 || m.kind === "exact")
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "exact" ? -1 : 1;
      return b.coverage - a.coverage;
    });
}

export function filterRecipes(
  recipes: Recipe[],
  opts: {
    query?: string;
    cookTime?: "15" | "30" | "60+" | "all";
    mealType?: string;
    diet?: string;
    method?: string;
  },
): Recipe[] {
  const q = opts.query?.trim().toLowerCase() ?? "";
  return recipes.filter((r) => {
    if (q) {
      const blob = [
        r.title,
        r.description,
        r.authorName,
        r.sourceUrl ?? "",
        ...r.steps.map((s) => s.text),
        ...r.ingredients.map((i) => i.name),
      ]
        .join(" ")
        .toLowerCase();
      if (!blob.includes(q)) return false;
    }
    if (opts.cookTime === "15" && r.cookTimeMinutes > 15) return false;
    if (opts.cookTime === "30" && r.cookTimeMinutes > 30) return false;
    if (opts.cookTime === "60+" && r.cookTimeMinutes <= 60) return false;
    if (opts.mealType && opts.mealType !== "all" && !r.mealTypes.includes(opts.mealType as never))
      return false;
    if (opts.diet && opts.diet !== "all" && !r.dietTags.includes(opts.diet as never)) return false;
    if (opts.method && opts.method !== "all" && !r.cookMethods.includes(opts.method as never))
      return false;
    return true;
  });
}

export function sortWithFavorites<T extends { id: string }>(
  items: T[],
  favoriteIds: Set<string>,
): T[] {
  return [...items].sort((a, b) => {
    const af = favoriteIds.has(a.id) ? 0 : 1;
    const bf = favoriteIds.has(b.id) ? 0 : 1;
    return af - bf;
  });
}
