"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ensureCategory, maybeSplitCategory, parseImportUrl, suggestCategoryName, suggestDrinkSubgroup, suggestMealTypes } from "./ai";
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
      subcategoryName?: string;
      visibility?: Visibility;
    },
  ) => Promise<Recipe>;
  updateRecipe: (
    id: string,
    input: Partial<
      Omit<Recipe, "id" | "createdAt" | "authorId" | "authorName" | "visibility" | "categoryId">
    > & { categoryName?: string; subcategoryName?: string },
  ) => Promise<Recipe>;
  deleteRecipe: (id: string) => Promise<void>;
  addCategory: (name: string) => Promise<Category>;
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

function mergeById<T extends { id: string }>(primary: T[], secondary: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of primary) map.set(item.id, item);
  for (const item of secondary) {
    if (!map.has(item.id)) map.set(item.id, item);
  }
  return [...map.values()];
}

function mergeRecipes(server: Recipe[], local: Recipe[]): Recipe[] {
  const map = new Map<string, Recipe>();
  for (const r of server) map.set(r.id, { ...r, visibility: "shared" });
  for (const r of local) {
    const existing = map.get(r.id);
    if (!existing) {
      map.set(r.id, { ...r, visibility: "shared" });
      continue;
    }
    const localTs = Date.parse(r.createdAt) || 0;
    const serverTs = Date.parse(existing.createdAt) || 0;
    if (localTs > serverTs) map.set(r.id, { ...r, visibility: "shared" });
  }
  return [...map.values()];
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

          const local = get();
          const recipes = mergeRecipes(data.recipes ?? [], local.recipes);
          const categories = mergeById(data.categories ?? [], local.categories);

          set({
            categories,
            recipes,
            syncStatus: "ready",
            syncError: null,
          });

          // Push any local-only recipes up to the shared cookbook
          const serverIds = new Set((data.recipes ?? []).map((r) => r.id));
          const missing = recipes.filter((r) => !serverIds.has(r.id));
          for (const recipe of missing) {
            try {
              await fetch("/api/recipes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  recipe: {
                    ...recipe,
                    categoryName: categories.find((c) => c.id === recipe.categoryId)?.name,
                  },
                }),
              });
            } catch {
              /* keep local; retry next sync */
            }
          }
        } catch (err) {
          // Keep whatever is already in localStorage — do not wipe recipes
          set({
            syncStatus: wasReady || get().recipes.length > 0 ? "ready" : "error",
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
        const suggestable = {
          title: input.title,
          description: input.description,
          ingredients: input.ingredients,
          mealTypes: input.mealTypes,
          cookTimeMinutes: input.cookTimeMinutes,
          steps: input.steps,
        };
        const categoryName = input.categoryName ?? suggestCategoryName(suggestable);
        let categories = get().categories;
        const ensured = ensureCategory(categories, categoryName);
        categories = ensured.categories;

        let subcategoryId = input.subcategoryId;
        let subcategoryName = input.subcategoryName;
        if (!subcategoryName && categoryName === "Напої") {
          subcategoryName = suggestDrinkSubgroup(suggestable);
        }
        if (subcategoryName) {
          const sub = ensureCategory(categories, subcategoryName, ensured.categoryId);
          categories = sub.categories;
          subcategoryId = sub.categoryId;
        }

        const mealTypes = suggestMealTypes(categoryName, input.mealTypes);

        const localRecipe: Recipe = {
          ...input,
          mealTypes,
          id: uid("r"),
          categoryId: ensured.categoryId,
          subcategoryId,
          authorId: user.id,
          authorName: user.name,
          visibility: "shared",
          createdAt: new Date().toISOString(),
        };

        let recipes = [...get().recipes.filter((r) => r.id !== localRecipe.id), localRecipe];
        const split = maybeSplitCategory(categories, recipes, ensured.categoryId);
        categories = split.categories;
        recipes = split.recipes;
        const savedLocal = recipes.find((r) => r.id === localRecipe.id) ?? localRecipe;

        // Save to browser immediately so refresh never loses the recipe
        set({ categories, recipes, syncStatus: "ready" });

        try {
          const res = await fetch("/api/recipes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipe: {
                ...savedLocal,
                categoryName,
                subcategoryName,
              },
            }),
          });
          const data = (await res.json()) as {
            recipe?: Recipe;
            kitchen?: { categories: Category[]; recipes: Recipe[] };
            error?: string;
          };

          if (res.ok && data.kitchen) {
            set({
              categories: mergeById(data.kitchen.categories, get().categories),
              recipes: mergeRecipes(data.kitchen.recipes, get().recipes),
              syncStatus: "ready",
              syncError: null,
            });
            return (
              get().recipes.find((r) => r.id === savedLocal.id) ??
              data.recipe ??
              savedLocal
            );
          }

          if (res.ok && data.recipe) {
            set((s) => ({
              recipes: mergeRecipes([data.recipe!], s.recipes),
            }));
            return data.recipe;
          }

          // Server failed — local copy already saved
          set({ syncError: data.error || "Збережено лише на цьому пристрої" });
          return savedLocal;
        } catch {
          set({ syncError: "Збережено на цьому пристрої (офлайн)" });
          return savedLocal;
        }
      },

      updateRecipe: async (id, input) => {
        const existing = get().recipes.find((r) => r.id === id);
        if (!existing) throw new Error("Рецепт не знайдено");

        let categories = get().categories;
        const draft: Recipe = {
          ...existing,
          ...input,
          id: existing.id,
          createdAt: existing.createdAt,
          authorId: existing.authorId,
          authorName: existing.authorName,
          visibility: "shared",
          title: (input.title ?? existing.title).trim(),
          description: input.description ?? existing.description,
          ingredients: input.ingredients ?? existing.ingredients,
          steps: input.steps ?? existing.steps,
        };

        // Manual category wins; otherwise re-pick from content
        const suggestable = {
          title: draft.title,
          description: draft.description,
          ingredients: draft.ingredients,
          mealTypes: draft.mealTypes,
          cookTimeMinutes: draft.cookTimeMinutes,
          steps: draft.steps,
        };
        const categoryName = input.categoryName ?? suggestCategoryName(suggestable);
        const ensured = ensureCategory(categories, categoryName);
        categories = ensured.categories;
        const categoryId = ensured.categoryId;

        let subcategoryId: string | undefined;
        let subcategoryName = input.subcategoryName;
        if (!subcategoryName && categoryName === "Напої" && input.categoryName !== undefined) {
          // Manual Напої without subgroup → suggest one
          subcategoryName = suggestDrinkSubgroup(suggestable);
        } else if (!subcategoryName && !input.categoryName && categoryName === "Напої") {
          subcategoryName = suggestDrinkSubgroup(suggestable);
        }
        if (subcategoryName) {
          const sub = ensureCategory(categories, subcategoryName, categoryId);
          categories = sub.categories;
          subcategoryId = sub.categoryId;
        } else if (existing.categoryId === categoryId) {
          subcategoryId = existing.subcategoryId;
        }

        const mealTypes = input.mealTypes
          ? suggestMealTypes(categoryName, input.mealTypes)
          : suggestMealTypes(categoryName, draft.mealTypes);

        const nextLocal: Recipe = {
          ...draft,
          mealTypes,
          categoryId,
          subcategoryId,
        };
        let recipes = get().recipes.map((r) => (r.id === id ? nextLocal : r));
        const split = maybeSplitCategory(categories, recipes, categoryId);
        categories = split.categories;
        recipes = split.recipes;
        set({ categories, recipes, syncStatus: "ready" });

        const savedLocal = get().recipes.find((r) => r.id === id) ?? nextLocal;

        try {
          const res = await fetch("/api/recipes", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id,
              patch: {
                title: savedLocal.title,
                description: savedLocal.description,
                sourceUrl: savedLocal.sourceUrl,
                ingredients: savedLocal.ingredients,
                steps: savedLocal.steps,
                imageUrl: savedLocal.imageUrl,
                cookTimeMinutes: savedLocal.cookTimeMinutes,
                mealTypes: savedLocal.mealTypes,
                dietTags: savedLocal.dietTags,
                cookMethods: savedLocal.cookMethods,
                servings: savedLocal.servings,
                categoryId: savedLocal.categoryId,
                subcategoryId: savedLocal.subcategoryId,
              },
            }),
          });
          const data = (await res.json()) as {
            recipe?: Recipe;
            kitchen?: { categories: Category[]; recipes: Recipe[] };
            error?: string;
          };

          if (res.ok && data.kitchen) {
            set({
              categories: mergeById(data.kitchen.categories, get().categories),
              recipes: mergeRecipes(data.kitchen.recipes, get().recipes),
              syncStatus: "ready",
              syncError: null,
            });
            return get().recipes.find((r) => r.id === id) ?? data.recipe ?? savedLocal;
          }

          if (res.ok && data.recipe) {
            set((s) => ({
              recipes: mergeRecipes([data.recipe!], s.recipes),
            }));
            return data.recipe;
          }

          set({ syncError: data.error || "Збережено лише на цьому пристрої" });
          return savedLocal;
        } catch {
          set({ syncError: "Збережено на цьому пристрої (офлайн)" });
          return savedLocal;
        }
      },

      deleteRecipe: async (id) => {
        set((s) => ({
          recipes: s.recipes.filter((r) => r.id !== id),
          favorites: s.favorites.filter((fid) => fid !== id),
          mealPlan: s.mealPlan.filter((m) => m.recipeId !== id),
          syncStatus: "ready",
        }));

        try {
          const res = await fetch("/api/recipes", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          });
          const data = (await res.json()) as {
            kitchen?: { categories: Category[]; recipes: Recipe[] };
            error?: string;
          };

          if (res.ok && data.kitchen) {
            set({
              categories: mergeById(data.kitchen.categories, get().categories),
              recipes: mergeRecipes(data.kitchen.recipes, get().recipes).filter(
                (r) => r.id !== id,
              ),
              syncStatus: "ready",
              syncError: null,
            });
            return;
          }

          if (!res.ok) {
            set({ syncError: data.error || "Видалено лише на цьому пристрої" });
          }
        } catch {
          set({ syncError: "Видалено на цьому пристрої (офлайн)" });
        }
      },

      addCategory: async (name) => {
        const trimmed = name.trim().replace(/\s+/g, " ");
        if (!trimmed) throw new Error("Вкажіть назву категорії");
        if (trimmed.length > 40) throw new Error("Назва задовга (до 40 символів)");

        const ensured = ensureCategory(get().categories, trimmed);
        set({ categories: ensured.categories, syncStatus: "ready" });
        const created = ensured.categories.find((c) => c.id === ensured.categoryId)!;

        try {
          const res = await fetch("/api/categories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: trimmed }),
          });
          const data = (await res.json()) as {
            kitchen?: { categories: Category[]; recipes: Recipe[] };
            category?: Category;
            error?: string;
          };

          if (res.ok && data.kitchen) {
            set({
              categories: mergeById(data.kitchen.categories, get().categories),
              syncStatus: "ready",
              syncError: null,
            });
            return (
              data.category ||
              get().categories.find(
                (c) => !c.parentId && c.name.toLowerCase() === trimmed.toLowerCase(),
              ) ||
              created
            );
          }

          if (!res.ok) {
            set({ syncError: data.error || "Категорію збережено лише на цьому пристрої" });
          }
        } catch {
          set({ syncError: "Категорію збережено на цьому пристрої (офлайн)" });
        }

        return created;
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
        set((s) => ({
          recipes: s.recipes.map((r) =>
            r.id === recipeId ? { ...r, visibility: "shared" } : r,
          ),
        }));
        try {
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
              categories: mergeById(data.kitchen.categories, get().categories),
              recipes: mergeRecipes(data.kitchen.recipes, get().recipes),
            });
          }
        } catch {
          /* local already updated */
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

      visibleRecipes: () => get().recipes.filter((r) => r.visibility !== "private"),
    }),
    {
      name: "oselya-kitchen-v4",
      partialize: (state) => ({
        user: state.user,
        categories: state.categories,
        recipes: state.recipes,
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
