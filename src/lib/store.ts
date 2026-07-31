"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ensureCategory, maybeSplitCategory, parseImportUrl, suggestCategoryName } from "./ai";
import { buildShoppingList } from "./kitchen";
import { demoUser, initialCategories, initialRecipes } from "./seed";
import type {
  Category,
  MealPlanEntry,
  MealType,
  Recipe,
  SearchHistoryItem,
  ShoppingItem,
  UserProfile,
  Visibility,
} from "./types";

interface KitchenState {
  user: UserProfile | null;
  categories: Category[];
  recipes: Recipe[];
  favorites: string[];
  mealPlan: MealPlanEntry[];
  shoppingList: ShoppingItem[];
  searchHistory: SearchHistoryItem[];
  signIn: () => void;
  signOut: () => void;
  toggleFavorite: (recipeId: string) => void;
  addRecipe: (input: Omit<Recipe, "id" | "createdAt" | "categoryId" | "authorId" | "authorName"> & {
    categoryName?: string;
  }) => Recipe;
  importFromUrl: (url: string) => Recipe;
  setVisibility: (recipeId: string, visibility: Visibility) => void;
  addToPlan: (date: string, mealType: MealType, recipeId: string, servings: number) => void;
  removeFromPlan: (entryId: string) => void;
  generateShoppingList: () => void;
  toggleShoppingItem: (id: string) => void;
  addCustomShoppingItem: (name: string, amount: number, unit: string) => void;
  pushSearchHistory: (query: string, kind: "text" | "ingredients") => void;
  clearSearchHistory: () => void;
  visibleRecipes: () => Recipe[];
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useKitchenStore = create<KitchenState>()(
  persist(
    (set, get) => ({
      user: null,
      categories: initialCategories,
      recipes: initialRecipes,
      favorites: ["r1", "r3"],
      mealPlan: [
        {
          id: "mp1",
          date: nextWeekday(1),
          mealType: "dinner",
          recipeId: "r1",
          servings: 4,
        },
        {
          id: "mp2",
          date: nextWeekday(1),
          mealType: "breakfast",
          recipeId: "r3",
          servings: 4,
        },
        {
          id: "mp3",
          date: nextWeekday(2),
          mealType: "dinner",
          recipeId: "r2",
          servings: 4,
        },
      ],
      shoppingList: [],
      searchHistory: [],

      signIn: () => set({ user: demoUser }),
      signOut: () => set({ user: null }),

      toggleFavorite: (recipeId) =>
        set((s) => ({
          favorites: s.favorites.includes(recipeId)
            ? s.favorites.filter((id) => id !== recipeId)
            : [...s.favorites, recipeId],
        })),

      addRecipe: (input) => {
        const user = get().user ?? demoUser;
        const categoryName = input.categoryName ?? suggestCategoryName(input);
        let categories = get().categories;
        const ensured = ensureCategory(categories, categoryName);
        categories = ensured.categories;

        const recipe: Recipe = {
          ...input,
          id: uid("r"),
          categoryId: ensured.categoryId,
          authorId: user.id,
          authorName: user.name,
          createdAt: new Date().toISOString(),
        };

        let recipes = [...get().recipes, recipe];
        const split = maybeSplitCategory(categories, recipes, ensured.categoryId);
        categories = split.categories;
        recipes = split.recipes;

        set({ categories, recipes });
        return recipes.find((r) => r.id === recipe.id) ?? recipe;
      },

      importFromUrl: (url) => {
        const parsed = parseImportUrl(url);
        return get().addRecipe({
          title: parsed.title,
          description: parsed.description,
          visibility: "shared",
          sourceUrl: parsed.sourceUrl,
          ingredients: parsed.ingredients ?? [],
          steps: parsed.steps ?? [],
          imageUrl: parsed.imageUrl ?? "",
          cookTimeMinutes: parsed.cookTimeMinutes ?? 30,
          mealTypes: parsed.mealTypes ?? ["dinner"],
          dietTags: parsed.dietTags ?? [],
          cookMethods: parsed.cookMethods ?? ["stovetop"],
          servings: parsed.servings ?? 4,
        });
      },

      setVisibility: (recipeId, visibility) =>
        set((s) => ({
          recipes: s.recipes.map((r) => (r.id === recipeId ? { ...r, visibility } : r)),
        })),

      addToPlan: (date, mealType, recipeId, servings) =>
        set((s) => ({
          mealPlan: [
            ...s.mealPlan,
            { id: uid("mp"), date, mealType, recipeId, servings },
          ],
        })),

      removeFromPlan: (entryId) =>
        set((s) => ({ mealPlan: s.mealPlan.filter((e) => e.id !== entryId) })),

      generateShoppingList: () => {
        const { mealPlan, recipes, shoppingList } = get();
        const extras = shoppingList.filter((i) => !i.fromRecipes);
        const checkedMap = new Map(shoppingList.map((i) => [i.id, i.checked]));
        const next = buildShoppingList(mealPlan, recipes, extras).map((item) => ({
          ...item,
          checked: checkedMap.get(item.id) ?? false,
        }));
        set({ shoppingList: next });
      },

      toggleShoppingItem: (id) =>
        set((s) => ({
          shoppingList: s.shoppingList.map((i) =>
            i.id === id ? { ...i, checked: !i.checked } : i,
          ),
        })),

      addCustomShoppingItem: (name, amount, unit) =>
        set((s) => ({
          shoppingList: [
            ...s.shoppingList,
            {
              id: uid("shop"),
              name,
              amount,
              unit,
              aisle: "other",
              checked: false,
              fromRecipes: false,
            },
          ],
        })),

      pushSearchHistory: (query, kind) => {
        const trimmed = query.trim();
        if (!trimmed) return;
        set((s) => ({
          searchHistory: [
            { id: uid("sh"), query: trimmed, kind, createdAt: new Date().toISOString() },
            ...s.searchHistory.filter((h) => h.query !== trimmed),
          ].slice(0, 8),
        }));
      },

      clearSearchHistory: () => set({ searchHistory: [] }),

      visibleRecipes: () => {
        const { user, recipes } = get();
        if (!user) return recipes.filter((r) => r.visibility === "shared");
        return recipes.filter((r) => r.visibility === "shared" || r.authorId === user.id);
      },
    }),
    { name: "oselya-kitchen-v2" },
  ),
);

function nextWeekday(offset: number): string {
  const d = new Date();
  const day = d.getDay();
  const toMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + toMonday + offset);
  return d.toISOString().slice(0, 10);
}
