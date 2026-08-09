"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ensureCategory, maybeSplitCategory, parseImportUrl, suggestCategoryName, suggestDrinkSubgroup, suggestMealTypes } from "./ai";
import { buildShoppingList } from "./kitchen";
import { demoUser } from "./seed";
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
  hydrateFromServer: () => Promise<void>;
  /** @deprecated Prefer hydrateFromServer */
  hydrateShared: () => Promise<void>;
  toggleFavorite: (recipeId: string) => Promise<void>;
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
  addToPlan: (date: string, mealType: MealType, recipeId: string, servings: number) => Promise<void>;
  removeFromPlan: (entryId: string) => Promise<void>;
  generateShoppingList: () => Promise<void>;
  toggleShoppingItem: (id: string) => Promise<void>;
  addCustomShoppingItem: (name: string, amount: number, unit: string) => Promise<void>;
  pushSearchHistory: (query: string, kind: "text" | "ingredients") => void;
  clearSearchHistory: () => void;
  visibleRecipes: () => Recipe[];
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function familyIdOf(user: UserProfile | null): string {
  return user?.familyId ?? demoUser.familyId;
}

function applyKitchen(
  kitchen: { categories: Category[]; recipes: Recipe[] },
  extra?: Partial<Pick<KitchenState, "favorites" | "mealPlan" | "shoppingList" | "syncError">>,
) {
  return {
    categories: kitchen.categories,
    recipes: kitchen.recipes.map((r) => ({ ...r, visibility: r.visibility ?? ("shared" as Visibility) })),
    syncStatus: "ready" as const,
    syncError: extra?.syncError ?? null,
    ...(extra?.favorites !== undefined ? { favorites: extra.favorites } : {}),
    ...(extra?.mealPlan !== undefined ? { mealPlan: extra.mealPlan } : {}),
    ...(extra?.shoppingList !== undefined ? { shoppingList: extra.shoppingList } : {}),
  };
}

async function putShoppingList(
  familyId: string,
  shoppingList: ShoppingItem[],
): Promise<ShoppingItem[]> {
  const res = await fetch("/api/shopping", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ familyId, shoppingList }),
  });
  const data = (await res.json()) as { shoppingList?: ShoppingItem[]; error?: string };
  if (!res.ok || !data.shoppingList) {
    throw new Error(data.error || "Не вдалося зберегти список покупок");
  }
  return data.shoppingList;
}

export const useKitchenStore = create<KitchenState>()(
  persist(
    (set, get) => ({
      user: null,
      categories: [],
      recipes: [],
      favorites: [],
      mealPlan: [],
      shoppingList: [],
      searchHistory: [],
      syncStatus: "idle",
      syncError: null,

      signIn: () => {
        set({ user: demoUser });
        void get().hydrateFromServer();
      },
      signOut: () => set({ user: null, favorites: [] }),

      hydrateFromServer: async () => {
        const wasReady = get().syncStatus === "ready";
        if (!wasReady) set({ syncStatus: "loading", syncError: null });

        const user = get().user;
        const familyId = familyIdOf(user);

        try {
          const recipesReq = fetch("/api/recipes", { cache: "no-store" });
          const mealPlanReq = fetch(
            `/api/meal-plan?familyId=${encodeURIComponent(familyId)}`,
            { cache: "no-store" },
          );
          const shoppingReq = fetch(
            `/api/shopping?familyId=${encodeURIComponent(familyId)}`,
            { cache: "no-store" },
          );
          const favoritesReq = user
            ? fetch(`/api/favorites?userId=${encodeURIComponent(user.id)}`, {
                cache: "no-store",
              })
            : null;

          const [recipesRes, mealPlanRes, shoppingRes, favoritesRes] = await Promise.all([
            recipesReq,
            mealPlanReq,
            shoppingReq,
            favoritesReq,
          ]);

          const recipesData = (await recipesRes.json()) as {
            categories?: Category[];
            recipes?: Recipe[];
            error?: string;
          };
          if (!recipesRes.ok) throw new Error(recipesData.error || "Sync failed");

          const mealPlanData = (await mealPlanRes.json()) as {
            mealPlan?: MealPlanEntry[];
            error?: string;
          };
          if (!mealPlanRes.ok) throw new Error(mealPlanData.error || "Meal plan sync failed");

          const shoppingData = (await shoppingRes.json()) as {
            shoppingList?: ShoppingItem[];
            error?: string;
          };
          if (!shoppingRes.ok) throw new Error(shoppingData.error || "Shopping sync failed");

          let favorites = get().favorites;
          if (favoritesRes) {
            const favoritesData = (await favoritesRes.json()) as {
              favorites?: string[];
              error?: string;
            };
            if (!favoritesRes.ok) throw new Error(favoritesData.error || "Favorites sync failed");
            favorites = favoritesData.favorites ?? [];
          } else {
            favorites = [];
          }

          set({
            categories: recipesData.categories ?? [],
            recipes: (recipesData.recipes ?? []).map((r) => ({
              ...r,
              visibility: r.visibility ?? "shared",
            })),
            favorites,
            mealPlan: mealPlanData.mealPlan ?? [],
            shoppingList: shoppingData.shoppingList ?? [],
            syncStatus: "ready",
            syncError: null,
          });
        } catch (err) {
          set({
            syncStatus: wasReady || get().recipes.length > 0 ? "ready" : "error",
            syncError: err instanceof Error ? err.message : "Sync failed",
          });
        }
      },

      hydrateShared: async () => get().hydrateFromServer(),

      toggleFavorite: async (recipeId) => {
        const user = get().user;
        if (!user) return;

        const prev = get().favorites;
        const favorited = !prev.includes(recipeId);
        set({
          favorites: favorited
            ? [...prev, recipeId]
            : prev.filter((id) => id !== recipeId),
        });

        try {
          const res = await fetch("/api/favorites", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.id, recipeId, favorited }),
          });
          const data = (await res.json()) as { favorites?: string[]; error?: string };
          if (!res.ok || !data.favorites) {
            throw new Error(data.error || "Не вдалося оновити вибране");
          }
          set({ favorites: data.favorites, syncError: null });
        } catch (err) {
          set({
            favorites: prev,
            syncError: err instanceof Error ? err.message : "Не вдалося оновити вибране",
          });
        }
      },

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
            set(applyKitchen(data.kitchen));
            return (
              get().recipes.find((r) => r.id === savedLocal.id) ??
              data.recipe ??
              savedLocal
            );
          }

          if (res.ok && data.recipe) {
            const serverRecipe: Recipe = { ...data.recipe, visibility: "shared" };
            set((s) => ({
              recipes: [
                ...s.recipes.filter((r) => r.id !== serverRecipe.id && r.id !== savedLocal.id),
                serverRecipe,
              ],
            }));
            return serverRecipe;
          }

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
            set(applyKitchen(data.kitchen));
            return get().recipes.find((r) => r.id === id) ?? data.recipe ?? savedLocal;
          }

          if (res.ok && data.recipe) {
            const serverRecipe: Recipe = { ...data.recipe, visibility: "shared" };
            set((s) => ({
              recipes: s.recipes.map((r) => (r.id === id ? serverRecipe : r)),
            }));
            return serverRecipe;
          }

          set({ syncError: data.error || "Збережено лише на цьому пристрої" });
          return savedLocal;
        } catch {
          set({ syncError: "Збережено на цьому пристрої (офлайн)" });
          return savedLocal;
        }
      },

      deleteRecipe: async (id) => {
        const prev = {
          recipes: get().recipes,
          favorites: get().favorites,
          mealPlan: get().mealPlan,
        };
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
              ...applyKitchen(data.kitchen),
              favorites: get().favorites.filter((fid) => fid !== id),
              mealPlan: get().mealPlan.filter((m) => m.recipeId !== id),
            });
            return;
          }

          if (!res.ok) {
            set({
              ...prev,
              syncError: data.error || "Видалено лише на цьому пристрої",
            });
          }
        } catch {
          set({
            ...prev,
            syncError: "Видалено на цьому пристрої (офлайн)",
          });
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
            set(applyKitchen(data.kitchen));
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
            set(applyKitchen(data.kitchen));
          }
        } catch {
          /* local already updated */
        }
      },

      addToPlan: async (date, mealType, recipeId, servings) => {
        const familyId = familyIdOf(get().user);
        const prev = get().mealPlan;
        const optimistic: MealPlanEntry = {
          id: uid("mp"),
          date,
          mealType,
          recipeId,
          servings,
        };
        set({ mealPlan: [...prev, optimistic] });

        try {
          const res = await fetch("/api/meal-plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              familyId,
              entry: { date, mealType, recipeId, servings },
            }),
          });
          const data = (await res.json()) as {
            entry?: MealPlanEntry;
            mealPlan?: MealPlanEntry[];
            error?: string;
          };
          if (!res.ok || !data.mealPlan) {
            throw new Error(data.error || "Не вдалося додати до плану");
          }
          set({ mealPlan: data.mealPlan, syncError: null });
        } catch (err) {
          set({
            mealPlan: prev,
            syncError: err instanceof Error ? err.message : "Не вдалося додати до плану",
          });
        }
      },

      removeFromPlan: async (entryId) => {
        const prev = get().mealPlan;
        set({ mealPlan: prev.filter((e) => e.id !== entryId) });

        try {
          const res = await fetch(
            `/api/meal-plan?id=${encodeURIComponent(entryId)}`,
            { method: "DELETE" },
          );
          const data = (await res.json()) as { deletedId?: string; error?: string };
          if (!res.ok) {
            throw new Error(data.error || "Не вдалося видалити з плану");
          }
          set({ syncError: null });
        } catch (err) {
          set({
            mealPlan: prev,
            syncError: err instanceof Error ? err.message : "Не вдалося видалити з плану",
          });
        }
      },

      generateShoppingList: async () => {
        const { mealPlan, recipes, shoppingList, user } = get();
        const familyId = familyIdOf(user);
        const extras = shoppingList.filter((i) => !i.fromRecipes);
        const checkedMap = new Map(shoppingList.map((i) => [i.id, i.checked]));
        const next = buildShoppingList(mealPlan, recipes, extras).map((item) => ({
          ...item,
          checked: checkedMap.get(item.id) ?? false,
        }));
        const prev = shoppingList;
        set({ shoppingList: next });

        try {
          const saved = await putShoppingList(familyId, next);
          set({ shoppingList: saved, syncError: null });
        } catch (err) {
          set({
            shoppingList: prev,
            syncError: err instanceof Error ? err.message : "Не вдалося зберегти список покупок",
          });
        }
      },

      toggleShoppingItem: async (id) => {
        const prev = get().shoppingList;
        const next = prev.map((i) =>
          i.id === id ? { ...i, checked: !i.checked } : i,
        );
        set({ shoppingList: next });

        try {
          const saved = await putShoppingList(familyIdOf(get().user), next);
          set({ shoppingList: saved, syncError: null });
        } catch (err) {
          set({
            shoppingList: prev,
            syncError: err instanceof Error ? err.message : "Не вдалося зберегти список покупок",
          });
        }
      },

      addCustomShoppingItem: async (name, amount, unit) => {
        const prev = get().shoppingList;
        const next = [
          ...prev,
          {
            id: uid("shop"),
            name,
            amount,
            unit,
            aisle: "other" as const,
            checked: false,
            fromRecipes: false,
          },
        ];
        set({ shoppingList: next });

        try {
          const saved = await putShoppingList(familyIdOf(get().user), next);
          set({ shoppingList: saved, syncError: null });
        } catch (err) {
          set({
            shoppingList: prev,
            syncError: err instanceof Error ? err.message : "Не вдалося зберегти список покупок",
          });
        }
      },

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
      name: "oselya-kitchen-v5",
      partialize: (state) => ({
        user: state.user,
        searchHistory: state.searchHistory,
      }),
    },
  ),
);
