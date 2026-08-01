import { NextRequest, NextResponse } from "next/server";
import { ensureCategory, maybeSplitCategory, suggestCategoryName } from "@/lib/ai";
import { getSharedKitchen, saveSharedKitchen } from "@/lib/shared-store";
import type { Recipe } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const kitchen = await getSharedKitchen();
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
      };
    };

    if (!body.recipe?.title?.trim()) {
      return NextResponse.json({ error: "Recipe title is required" }, { status: 400 });
    }

    const kitchen = await getSharedKitchen();
    let categories = kitchen.categories;
    const categoryName =
      body.recipe.categoryName ??
      suggestCategoryName({
        title: body.recipe.title,
        description: body.recipe.description ?? "",
        ingredients: body.recipe.ingredients ?? [],
      });

    const ensured = ensureCategory(categories, categoryName);
    categories = ensured.categories;

    const recipe: Recipe = {
      title: body.recipe.title.trim(),
      description: body.recipe.description ?? "",
      subcategoryId: body.recipe.subcategoryId,
      authorId: body.recipe.authorId,
      authorName: body.recipe.authorName,
      sourceUrl: body.recipe.sourceUrl,
      ingredients: body.recipe.ingredients ?? [],
      steps: body.recipe.steps ?? [],
      imageUrl: body.recipe.imageUrl ?? "",
      cookTimeMinutes: body.recipe.cookTimeMinutes ?? 30,
      mealTypes: body.recipe.mealTypes ?? ["dinner"],
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

    const next = await saveSharedKitchen({
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

    const kitchen = await getSharedKitchen();
    const existing = kitchen.recipes.find((r) => r.id === body.id);
    if (!existing) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    const patch = body.patch ?? {};
    let categories = kitchen.categories;
    let categoryId = patch.categoryId ?? existing.categoryId;

    const draft: Recipe = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      visibility: "shared",
      title: (patch.title ?? existing.title).trim(),
      categoryId,
    };

    if (patch.title || patch.description || patch.ingredients) {
      const categoryName = suggestCategoryName(draft);
      const ensured = ensureCategory(categories, categoryName);
      categories = ensured.categories;
      categoryId = ensured.categoryId;
    }

    const updated: Recipe = { ...draft, categoryId };
    let recipes = kitchen.recipes.map((r) => (r.id === body.id ? updated : r));
    const split = maybeSplitCategory(categories, recipes, categoryId);
    categories = split.categories;
    recipes = split.recipes;

    const next = await saveSharedKitchen({ ...kitchen, categories, recipes });
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
    const body = (await req.json()) as { id?: string };
    if (!body.id) {
      return NextResponse.json({ error: "Recipe id is required" }, { status: 400 });
    }

    const kitchen = await getSharedKitchen();
    if (!kitchen.recipes.some((r) => r.id === body.id)) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    const recipes = kitchen.recipes.filter((r) => r.id !== body.id);
    const next = await saveSharedKitchen({ ...kitchen, recipes });
    return NextResponse.json({ kitchen: next, deletedId: body.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete recipe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
