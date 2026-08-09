/**
 * /api/meal-plan — demo auth via familyId query/body (default family-koval)
 *
 * GET    ?familyId=       → { mealPlan: MealPlanEntry[] }
 * POST   { familyId?, entry: { id?, date, mealType, recipeId, servings } }
 *                         → { entry: MealPlanEntry, mealPlan: MealPlanEntry[] }
 * PATCH  { id, servings? | date? | mealType? | recipeId? }
 *                         → { entry: MealPlanEntry }
 * DELETE ?id=             → { deletedId: string }
 */
import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_FAMILY_ID,
  addMealPlanEntry,
  getMealPlan,
  removeMealPlanEntry,
  updateMealPlanEntry,
} from "@/db/kitchen-repo";
import type { MealPlanEntry, MealType } from "@/lib/types";

export const dynamic = "force-dynamic";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

function resolveFamilyId(raw: string | null | undefined): string {
  return raw?.trim() || DEFAULT_FAMILY_ID;
}

export async function GET(req: NextRequest) {
  try {
    const familyId = resolveFamilyId(req.nextUrl.searchParams.get("familyId"));
    const mealPlan = await getMealPlan(familyId);
    return NextResponse.json(
      { mealPlan },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load meal plan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      familyId?: string;
      entry?: Partial<MealPlanEntry> & {
        date?: string;
        mealType?: MealType;
        recipeId?: string;
        servings?: number;
      };
    };
    const familyId = resolveFamilyId(body.familyId);
    const raw = body.entry;
    if (!raw?.date?.trim() || !raw.recipeId?.trim() || !raw.mealType) {
      return NextResponse.json(
        { error: "entry.date, entry.mealType, and entry.recipeId are required" },
        { status: 400 },
      );
    }
    if (!MEAL_TYPES.includes(raw.mealType)) {
      return NextResponse.json({ error: "Invalid mealType" }, { status: 400 });
    }

    const entry: MealPlanEntry = {
      id: raw.id?.trim() || `mp-${crypto.randomUUID().slice(0, 8)}`,
      date: raw.date.trim(),
      mealType: raw.mealType,
      recipeId: raw.recipeId.trim(),
      servings: typeof raw.servings === "number" && raw.servings > 0 ? raw.servings : 4,
    };

    const saved = await addMealPlanEntry(entry, familyId);
    const mealPlan = await getMealPlan(familyId);
    return NextResponse.json({ entry: saved, mealPlan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add meal plan entry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id?: string;
      servings?: number;
      date?: string;
      mealType?: MealType;
      recipeId?: string;
    };
    const id = body.id?.trim();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const patch: Partial<Pick<MealPlanEntry, "date" | "mealType" | "recipeId" | "servings">> =
      {};
    if (typeof body.servings === "number") patch.servings = body.servings;
    if (body.date?.trim()) patch.date = body.date.trim();
    if (body.recipeId?.trim()) patch.recipeId = body.recipeId.trim();
    if (body.mealType) {
      if (!MEAL_TYPES.includes(body.mealType)) {
        return NextResponse.json({ error: "Invalid mealType" }, { status: 400 });
      }
      patch.mealType = body.mealType;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const entry = await updateMealPlanEntry(id, patch);
    if (!entry) {
      return NextResponse.json({ error: "Meal plan entry not found" }, { status: 404 });
    }
    return NextResponse.json({ entry });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update meal plan entry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const deleted = await removeMealPlanEntry(id);
    if (!deleted) {
      return NextResponse.json({ error: "Meal plan entry not found" }, { status: 404 });
    }
    return NextResponse.json({ deletedId: id });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete meal plan entry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
