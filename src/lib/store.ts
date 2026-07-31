"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { parseImportUrl } from "./ai";
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
  syncStatus: "idle" | "loading" | "ready" | "error";
  syncError: string | null;
  signIn: () => void;
  signOut: () => void;
  hydrateShared: () => Promise<void>;
  toggleFavorite: (recipeId: string) => void;
  addRecipe: (
    input: Omit<Recipe, "id" | "createdAt" | "categoryId" | "authorId" | "authorName" | "visibility"> & {
      categoryName?: string;
      visibility?: Visibility;
    },
  ) => Promise<Recipe>;
  importFromUrl: (url: string) => Promise<Recipe>;
  setVisibility: (recipeId: string, visibility: Visibility) => Promise<void>;
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
      syncStatus: "idle",
      syncError: null,

      signIn: () => set({ user: demoUser }),
      signOut: () => set({ user: null }),

      hydrateShared: async () => {
        const wasReady = get().syncStatus === "ready";
        if (!wasReady) set({ syncStatus: "loading", syncError: null });
        try {
          const res = await fetch("/api/recipes", { cache: "no-store" });
          const data = (await res.json()) as {
            categories?: Category[];
            recipes?: Recipe[];
            error?: string;
          };
          if (!res.ok) throw new Error(data.error || "Sync failed");
          set({
            categories: data.categories ?? initialCategories,
            recipes: (data.recipes ?? []).map((r) => ({ ...r, visibility: "shared" })),
            syncStatus: "ready",
            syncError: null,
          });
        } catch (err) {
          set({
            syncStatus: wasReady ? "ready" : "error",
            syncError: err instanceof Error ? err.message : "Sync failed",
          });
        }
      },

      toggleFavorite: (recipeId) =>
        set((s) => ({
          favorites: s.favorites.includes(recipeId)
            ? s.favorites.filter((id) => id !== recipeId)
            : [...s.favorites, recipeId],
        })),

      addRecipe: async (input) => {
        const user = get().user ?? demoUser;
        const res = await fetch("/api/recipes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipe: {
              ...input,
              authorId: user.id,
              authorName: user.name,
              visibility: "shared",
            },
          }),
        });
        const data = (await res.json()) as {
          recipe?: Recipe;
          kitchen?: { categories: Category[]; recipes: Recipe[] };
          error?: string;
        };
        if (!res.ok || !data.recipe) {
          throw new Error(data.error || "Не вдалося зберегти рецепт");
        }

        if (data.kitchen) {
          set({
            categories: data.kitchen.categories,
            recipes: data.kitchen.recipes.map((r) => ({ ...r, visibility: "shared" })),
            syncStatus: "ready",
          });
        } else {
          set((s) => ({
            recipes: [...s.recipes.filter((r) => r.id !== data.recipe!.id), data.recipe!],
          }));
        }

        return data.recipe;
      },

      importFromUrl: async (url) => {
        const parsed = parseImportUrl(url);
        return get().addRecipe({
          title: parsed.title,
          description: parsed.description,
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

      setVisibility: async (recipeId) => {
        // Site-wide cookbook: every recipe stays visible to everyone
        const res = await fetch("/api/recipes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: recipeId, patch: { visibility: "shared" } }),
        });
        const data = (await res.json()) as {
          kitchen?: { categories: Category[]; recipes: Recipe[] };
        };
        if (data.kitchen) {
          set({
            categories: data.kitchen.categories,
            recipes: data.kitchen.recipes.map((r) => ({ ...r, visibility: "shared" })),
          });
        } else {
          set((s) => ({
            recipes: s.recipes.map((r) =>
              r.id === recipeId ? { ...r, visibility: "shared" } : r,
            ),
          }));
        }
      },

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

      visibleRecipes: () => get().recipes.filter((r) => r.visibility === "shared"),
    }),
    {
      name: "oselya-kitchen-v3",
      partialize: (state) => ({
        user: state.user,
        favorites: state.favorites,
        mealPlan: state.mealPlan,
        shoppingList: state.shoppingList,
        searchHistory: state.searchHistory,
      }),
    },
  ),
);

function nextWeekday(offset: number): string {
  const d = new Date();
  const day = d.getDay();
  const toMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + toMonday + offset);
  return d.toISOString().slice(0, 10);
}
