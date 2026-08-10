import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "./client";
import {
  categories,
  favorites,
  mealPlanEntries,
  meta,
  recipes,
  shoppingItems,
} from "./schema";
import type {
  Category,
  CookMethod,
  DietTag,
  Favorite,
  Ingredient,
  MealPlanEntry,
  MealType,
  Recipe,
  RecipeStep,
  ShoppingItem,
  StoreAisle,
  Visibility,
} from "@/lib/types";

const UPDATED_AT_KEY = "kitchen_updated_at";
const DELETED_RECIPE_IDS_KEY = "deleted_recipe_ids";
export const DEFAULT_FAMILY_ID = "family-koval";

export interface SharedKitchen {
  categories: Category[];
  recipes: Recipe[];
  updatedAt: string;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToCategory(row: typeof categories.$inferSelect): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    ...(row.parentId ? { parentId: row.parentId } : {}),
  };
}

function rowToRecipe(row: typeof recipes.$inferSelect): Recipe {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    categoryId: row.categoryId,
    ...(row.subcategoryId ? { subcategoryId: row.subcategoryId } : {}),
    authorId: row.authorId,
    authorName: row.authorName,
    visibility: row.visibility as Visibility,
    ...(row.sourceUrl ? { sourceUrl: row.sourceUrl } : {}),
    ingredients: parseJson<Ingredient[]>(row.ingredients, []),
    steps: parseJson<RecipeStep[]>(row.steps, []),
    imageUrl: row.imageUrl,
    cookTimeMinutes: row.cookTimeMinutes,
    mealTypes: parseJson<MealType[]>(row.mealTypes, []),
    dietTags: parseJson<DietTag[]>(row.dietTags, []),
    cookMethods: parseJson<CookMethod[]>(row.cookMethods, []),
    servings: row.servings,
    createdAt: row.createdAt,
  };
}

function recipeToRow(recipe: Recipe) {
  return {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    categoryId: recipe.categoryId,
    subcategoryId: recipe.subcategoryId ?? null,
    authorId: recipe.authorId,
    authorName: recipe.authorName,
    visibility: recipe.visibility,
    sourceUrl: recipe.sourceUrl ?? null,
    ingredients: JSON.stringify(recipe.ingredients ?? []),
    steps: JSON.stringify(recipe.steps ?? []),
    imageUrl: recipe.imageUrl ?? "",
    cookTimeMinutes: recipe.cookTimeMinutes,
    mealTypes: JSON.stringify(recipe.mealTypes ?? []),
    dietTags: JSON.stringify(recipe.dietTags ?? []),
    cookMethods: JSON.stringify(recipe.cookMethods ?? []),
    servings: recipe.servings,
    createdAt: recipe.createdAt,
  };
}

function categoryToRow(category: Category) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    parentId: category.parentId ?? null,
  };
}

function rowToMealPlan(row: typeof mealPlanEntries.$inferSelect): MealPlanEntry {
  return {
    id: row.id,
    date: row.date,
    mealType: row.mealType as MealType,
    recipeId: row.recipeId,
    servings: row.servings,
  };
}

function rowToShoppingItem(row: typeof shoppingItems.$inferSelect): ShoppingItem {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    unit: row.unit,
    aisle: row.aisle as StoreAisle,
    checked: Boolean(row.checked),
    fromRecipes: parseJson<boolean>(row.fromRecipes, false),
  };
}

async function setUpdatedAt(value: string): Promise<void> {
  const db = getDb();
  await db
    .insert(meta)
    .values({ key: UPDATED_AT_KEY, value })
    .onConflictDoUpdate({
      target: meta.key,
      set: { value },
    });
}

async function getUpdatedAt(): Promise<string> {
  const db = getDb();
  const rows = await db.select().from(meta).where(eq(meta.key, UPDATED_AT_KEY)).limit(1);
  return rows[0]?.value ?? new Date(0).toISOString();
}

export async function getKitchen(): Promise<SharedKitchen> {
  const db = getDb();
  const [categoryRows, recipeRows, updatedAt, deletedIds] = await Promise.all([
    db.select().from(categories),
    db.select().from(recipes),
    getUpdatedAt(),
    readDeletedRecipeIds(db),
  ]);

  return {
    categories: categoryRows.map(rowToCategory),
    recipes: recipeRows
      .map(rowToRecipe)
      .filter((r) => !deletedIds.has(r.id)),
    updatedAt,
  };
}

async function readDeletedRecipeIds(
  runner: ReturnType<typeof getDb> = getDb(),
): Promise<Set<string>> {
  const rows = await runner.select().from(meta).where(eq(meta.key, DELETED_RECIPE_IDS_KEY)).limit(1);
  if (!rows[0]?.value) return new Set();
  try {
    const parsed = JSON.parse(rows[0].value) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0));
  } catch {
    return new Set();
  }
}

async function writeDeletedRecipeIds(
  ids: Set<string>,
  runner: ReturnType<typeof getDb> = getDb(),
): Promise<void> {
  const value = JSON.stringify([...ids].sort());
  await runner
    .insert(meta)
    .values({ key: DELETED_RECIPE_IDS_KEY, value })
    .onConflictDoUpdate({
      target: meta.key,
      set: { value },
    });
}

/** Persist full kitchen snapshot (categories + recipes). Idempotent upserts; removes missing rows. */
export async function saveKitchen(
  kitchen: SharedKitchen,
  options?: { pruneMissing?: boolean },
): Promise<SharedKitchen> {
  const db = getDb();
  const pruneMissing = options?.pruneMissing ?? true;
  const updatedAt = kitchen.updatedAt || new Date().toISOString();
  const deletedIds = await readDeletedRecipeIds(db);
  const liveRecipes = kitchen.recipes.filter((r) => !deletedIds.has(r.id));
  const categoryIds = kitchen.categories.map((c) => c.id);
  const recipeIds = liveRecipes.map((r) => r.id);

  await db.transaction(async (tx) => {
    for (const category of kitchen.categories) {
      const row = categoryToRow(category);
      await tx
        .insert(categories)
        .values(row)
        .onConflictDoUpdate({
          target: categories.id,
          set: {
            name: row.name,
            slug: row.slug,
            parentId: row.parentId,
          },
        });
    }

    for (const recipe of liveRecipes) {
      const row = recipeToRow(recipe);
      await tx
        .insert(recipes)
        .values(row)
        .onConflictDoUpdate({
          target: recipes.id,
          set: {
            title: row.title,
            description: row.description,
            categoryId: row.categoryId,
            subcategoryId: row.subcategoryId,
            authorId: row.authorId,
            authorName: row.authorName,
            visibility: row.visibility,
            sourceUrl: row.sourceUrl,
            ingredients: row.ingredients,
            steps: row.steps,
            imageUrl: row.imageUrl,
            cookTimeMinutes: row.cookTimeMinutes,
            mealTypes: row.mealTypes,
            dietTags: row.dietTags,
            cookMethods: row.cookMethods,
            servings: row.servings,
            createdAt: row.createdAt,
          },
        });
    }

    if (pruneMissing) {
      const existingRecipes = await tx.select({ id: recipes.id }).from(recipes);
      const toDeleteRecipes = existingRecipes
        .map((r) => r.id)
        .filter((id) => !recipeIds.includes(id));
      if (toDeleteRecipes.length > 0) {
        await tx.delete(favorites).where(inArray(favorites.recipeId, toDeleteRecipes));
        await tx.delete(mealPlanEntries).where(inArray(mealPlanEntries.recipeId, toDeleteRecipes));
        await tx.delete(recipes).where(inArray(recipes.id, toDeleteRecipes));
      }

      const existingCategories = await tx.select({ id: categories.id }).from(categories);
      const toDeleteCategories = existingCategories
        .map((c) => c.id)
        .filter((id) => !categoryIds.includes(id));
      if (toDeleteCategories.length > 0) {
        await tx.delete(categories).where(inArray(categories.id, toDeleteCategories));
      }
    }

    await tx
      .insert(meta)
      .values({ key: UPDATED_AT_KEY, value: updatedAt })
      .onConflictDoUpdate({
        target: meta.key,
        set: { value: updatedAt },
      });
  });

  return { categories: kitchen.categories, recipes: liveRecipes, updatedAt };
}

export async function createRecipe(recipe: Recipe): Promise<Recipe> {
  const db = getDb();
  const row = recipeToRow(recipe);
  await db.insert(recipes).values(row).onConflictDoUpdate({
    target: recipes.id,
    set: {
      title: row.title,
      description: row.description,
      categoryId: row.categoryId,
      subcategoryId: row.subcategoryId,
      authorId: row.authorId,
      authorName: row.authorName,
      visibility: row.visibility,
      sourceUrl: row.sourceUrl,
      ingredients: row.ingredients,
      steps: row.steps,
      imageUrl: row.imageUrl,
      cookTimeMinutes: row.cookTimeMinutes,
      mealTypes: row.mealTypes,
      dietTags: row.dietTags,
      cookMethods: row.cookMethods,
      servings: row.servings,
      createdAt: row.createdAt,
    },
  });
  await setUpdatedAt(new Date().toISOString());
  return recipe;
}

export async function updateRecipe(
  id: string,
  patch: Partial<Recipe>,
): Promise<Recipe | null> {
  const db = getDb();
  const existing = await db.select().from(recipes).where(eq(recipes.id, id)).limit(1);
  if (!existing[0]) return null;

  const current = rowToRecipe(existing[0]);
  const next: Recipe = {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
  };
  const { id: _id, ...row } = recipeToRow(next);
  await db.update(recipes).set(row).where(eq(recipes.id, id));
  await setUpdatedAt(new Date().toISOString());
  return next;
}

/** Permanently delete a recipe and related favorites / meal-plan rows. Survives re-seed. */
export async function deleteRecipe(id: string): Promise<void> {
  const db = getDb();
  const deletedIds = await readDeletedRecipeIds(db);
  deletedIds.add(id);
  await writeDeletedRecipeIds(deletedIds, db);

  await db.delete(favorites).where(eq(favorites.recipeId, id));
  await db.delete(mealPlanEntries).where(eq(mealPlanEntries.recipeId, id));
  await db.delete(recipes).where(eq(recipes.id, id));
  await setUpdatedAt(new Date().toISOString());
}

export async function addCategory(category: Category): Promise<Category> {
  const db = getDb();
  const row = categoryToRow(category);
  await db.insert(categories).values(row).onConflictDoUpdate({
    target: categories.id,
    set: {
      name: row.name,
      slug: row.slug,
      parentId: row.parentId,
    },
  });
  await setUpdatedAt(new Date().toISOString());
  return category;
}

export async function upsertCategories(list: Category[]): Promise<void> {
  const db = getDb();
  for (const category of list) {
    const row = categoryToRow(category);
    await db.insert(categories).values(row).onConflictDoUpdate({
      target: categories.id,
      set: {
        name: row.name,
        slug: row.slug,
        parentId: row.parentId,
      },
    });
  }
  await setUpdatedAt(new Date().toISOString());
}

export async function getFavorites(userId: string): Promise<Favorite[]> {
  const db = getDb();
  const rows = await db.select().from(favorites).where(eq(favorites.userId, userId));
  return rows.map((r) => ({ userId: r.userId, recipeId: r.recipeId }));
}

export async function setFavorite(
  userId: string,
  recipeId: string,
  isFavorite: boolean,
): Promise<void> {
  const db = getDb();
  if (isFavorite) {
    await db
      .insert(favorites)
      .values({ userId, recipeId })
      .onConflictDoNothing();
    return;
  }
  await db
    .delete(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.recipeId, recipeId)));
}

/** Returns whether the recipe is favorited after the toggle. */
export async function toggleFavorite(
  userId: string,
  recipeId: string,
): Promise<boolean> {
  const rows = await getFavorites(userId);
  const next = !rows.some((f) => f.recipeId === recipeId);
  await setFavorite(userId, recipeId, next);
  return next;
}

export async function getMealPlan(
  familyId: string = DEFAULT_FAMILY_ID,
): Promise<MealPlanEntry[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(mealPlanEntries)
    .where(eq(mealPlanEntries.familyId, familyId));
  return rows.map(rowToMealPlan);
}

export async function addMealPlanEntry(
  entry: MealPlanEntry,
  familyId: string = DEFAULT_FAMILY_ID,
): Promise<MealPlanEntry> {
  const db = getDb();
  await db
    .insert(mealPlanEntries)
    .values({
      id: entry.id,
      date: entry.date,
      mealType: entry.mealType,
      recipeId: entry.recipeId,
      servings: entry.servings,
      familyId,
    })
    .onConflictDoUpdate({
      target: mealPlanEntries.id,
      set: {
        date: entry.date,
        mealType: entry.mealType,
        recipeId: entry.recipeId,
        servings: entry.servings,
        familyId,
      },
    });
  return entry;
}

/** @deprecated Prefer addMealPlanEntry */
export const upsertMealPlan = addMealPlanEntry;

export async function updateMealPlanEntry(
  id: string,
  patch: Partial<Pick<MealPlanEntry, "date" | "mealType" | "recipeId" | "servings">>,
): Promise<MealPlanEntry | null> {
  const db = getDb();
  const existing = await db
    .select()
    .from(mealPlanEntries)
    .where(eq(mealPlanEntries.id, id))
    .limit(1);
  if (!existing[0]) return null;

  const current = rowToMealPlan(existing[0]);
  const next: MealPlanEntry = {
    ...current,
    ...patch,
    id: current.id,
  };
  await db
    .update(mealPlanEntries)
    .set({
      date: next.date,
      mealType: next.mealType,
      recipeId: next.recipeId,
      servings: next.servings,
    })
    .where(eq(mealPlanEntries.id, id));
  return next;
}

export async function removeMealPlanEntry(id: string): Promise<boolean> {
  const db = getDb();
  const result = await db.delete(mealPlanEntries).where(eq(mealPlanEntries.id, id));
  return (result.rowsAffected ?? 0) > 0;
}

/** @deprecated Prefer removeMealPlanEntry */
export const deleteMealPlanEntry = removeMealPlanEntry;

export async function getShoppingList(
  familyId: string = DEFAULT_FAMILY_ID,
): Promise<ShoppingItem[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(shoppingItems)
    .where(eq(shoppingItems.familyId, familyId));
  return rows.map(rowToShoppingItem);
}

export async function saveShoppingList(
  familyId: string,
  items: ShoppingItem[],
): Promise<ShoppingItem[]> {
  const db = getDb();
  const fid = familyId || DEFAULT_FAMILY_ID;
  const ids = items.map((i) => i.id);

  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx
        .insert(shoppingItems)
        .values({
          id: item.id,
          name: item.name,
          amount: item.amount,
          unit: item.unit,
          aisle: item.aisle,
          checked: item.checked,
          fromRecipes: JSON.stringify(item.fromRecipes),
          familyId: fid,
        })
        .onConflictDoUpdate({
          target: shoppingItems.id,
          set: {
            name: item.name,
            amount: item.amount,
            unit: item.unit,
            aisle: item.aisle,
            checked: item.checked,
            fromRecipes: JSON.stringify(item.fromRecipes),
            familyId: fid,
          },
        });
    }

    const existing = await tx
      .select({ id: shoppingItems.id })
      .from(shoppingItems)
      .where(eq(shoppingItems.familyId, fid));
    const toDelete = existing.map((r) => r.id).filter((id) => !ids.includes(id));
    if (toDelete.length > 0) {
      await tx.delete(shoppingItems).where(inArray(shoppingItems.id, toDelete));
    }
  });

  return items;
}
