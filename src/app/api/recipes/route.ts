import { NextRequest, NextResponse } from "next/server";
import { ensureCategory, maybeSplitCategory, suggestCategoryName, suggestDrinkSubgroup, suggestMealTypes } from "@/lib/ai";
import { getKitchen, saveKitchen, deleteRecipe } from "@/db/kitchen-repo";
import type { Recipe } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const kitchen = await getKitchen();
    return NextResponse.json(kitchen, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load recipes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      recipe?: Omit<Recipe, "id" | "createdAt" | "categoryId" | "visibility"> & {
        id?: string;
        categoryName?: string;
        subcategoryName?: string;
      };
    };

    if (!body.recipe?.title?.trim()) {
      return NextResponse.json({ error: "Recipe title is required" }, { status: 400 });
    }

    const kitchen = await getKitchen();
    let categories = kitchen.categories;
    const suggestable = {
      title: body.recipe.title,
      description: body.recipe.description ?? "",
      ingredients: body.recipe.ingredients ?? [],
      mealTypes: body.recipe.mealTypes,
      cookTimeMinutes: body.recipe.cookTimeMinutes,
      steps: body.recipe.steps,
    };
    const categoryName = body.recipe.categoryName ?? suggestCategoryName(suggestable);

    const ensured = ensureCategory(categories, categoryName);
    categories = ensured.categories;

    let subcategoryId = body.recipe.subcategoryId;
    const subcategoryName =
      body.recipe.subcategoryName ??
      (categoryName === "Напої" ? suggestDrinkSubgroup(suggestable) : undefined);
    if (subcategoryName) {
      const sub = ensureCategory(categories, subcategoryName, ensured.categoryId);
      categories = sub.categories;
      subcategoryId = sub.categoryId;
    }

    const mealTypes = suggestMealTypes(categoryName, body.recipe.mealTypes);

    const recipe: Recipe = {
      title: body.recipe.title.trim(),
      description: body.recipe.description ?? "",
      subcategoryId,
      authorId: body.recipe.authorId,
      authorName: body.recipe.authorName,
      sourceUrl: body.recipe.sourceUrl,
      ingredients: body.recipe.ingredients ?? [],
      steps: body.recipe.steps ?? [],
      imageUrl: body.recipe.imageUrl ?? "",
      cookTimeMinutes: body.recipe.cookTimeMinutes ?? 30,
      mealTypes,
      dietTags: body.recipe.dietTags ?? [],
      cookMethods: body.recipe.cookMethods ?? ["stovetop"],
      servings: body.recipe.servings ?? 4,
      id: body.recipe.id ?? `r-${crypto.randomUUID().slice(0, 8)}`,
      categoryId: ensured.categoryId,
      visibility: "shared",
      createdAt: new Date().toISOString(),
    };

    let recipes = [...kitchen.recipes.filter((r) => r.id !== recipe.id), recipe];
    const split = maybeSplitCategory(categories, recipes, ensured.categoryId);
    categories = split.categories;
    recipes = split.recipes;

    const next = await saveKitchen({
      categories,
      recipes,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      recipe: next.recipes.find((r) => r.id === recipe.id) ?? recipe,
      kitchen: next,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save recipe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as { id?: string; patch?: Partial<Recipe> };
    if (!body.id) {
      return NextResponse.json({ error: "Recipe id is required" }, { status: 400 });
    }

    const kitchen = await getKitchen();
    const existing = kitchen.recipes.find((r) => r.id === body.id);
    if (!existing) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    const patch = body.patch ?? {};
    let categories = kitchen.categories;

    const draft: Recipe = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      visibility: "shared",
      title: (patch.title ?? existing.title).trim(),
    };

    const suggestable = {
      title: draft.title,
      description: draft.description,
      ingredients: draft.ingredients,
      mealTypes: draft.mealTypes,
      cookTimeMinutes: draft.cookTimeMinutes,
      steps: draft.steps,
    };

    // Prefer explicit categoryId from client; otherwise re-classify from content
    let categoryId = patch.categoryId ?? existing.categoryId;
    if (!patch.categoryId) {
      const categoryName = suggestCategoryName(suggestable);
      const ensured = ensureCategory(categories, categoryName);
      categories = ensured.categories;
      categoryId = ensured.categoryId;
    } else {
      // Keep category list in sync if id is unknown somehow
      const known = categories.some((c) => c.id === categoryId);
      if (!known) {
        const categoryName = suggestCategoryName(suggestable);
        const ensured = ensureCategory(categories, categoryName);
        categories = ensured.categories;
        categoryId = ensured.categoryId;
      }
    }

    let subcategoryId =
      patch.subcategoryId !== undefined
        ? patch.subcategoryId
        : existing.categoryId === categoryId
          ? existing.subcategoryId
          : undefined;

    const parent = categories.find((c) => c.id === categoryId);
    if (!subcategoryId && parent?.name === "Напої") {
      const subName = suggestDrinkSubgroup(suggestable);
      if (subName) {
        const sub = ensureCategory(categories, subName, categoryId);
        categories = sub.categories;
        subcategoryId = sub.categoryId;
      }
    }

    const mealTypes = suggestMealTypes(parent?.name ?? "Основні страви", draft.mealTypes);

    const updated: Recipe = {
      ...draft,
      mealTypes,
      categoryId,
      subcategoryId,
    };
    let recipes = kitchen.recipes.map((r) => (r.id === body.id ? updated : r));
    const split = maybeSplitCategory(categories, recipes, categoryId);
    categories = split.categories;
    recipes = split.recipes;

    const next = await saveKitchen({
      ...kitchen,
      categories,
      recipes,
      updatedAt: new Date().toISOString(),
    });
    return NextResponse.json({
      recipe: next.recipes.find((r) => r.id === body.id) ?? updated,
      kitchen: next,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update recipe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const urlId = req.nextUrl.searchParams.get("id")?.trim();
    let bodyId: string | undefined;
    try {
      const body = (await req.json()) as { id?: string };
      bodyId = body.id?.trim();
    } catch {
      bodyId = undefined;
    }
    const id = urlId || bodyId;
    if (!id) {
      return NextResponse.json({ error: "Recipe id is required" }, { status: 400 });
    }

    await deleteRecipe(id);
    const kitchen = await getKitchen();
    return NextResponse.json({ kitchen, deletedId: id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete recipe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
