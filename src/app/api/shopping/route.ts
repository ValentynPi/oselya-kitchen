/**
 * /api/shopping — demo auth via familyId query/body (default family-koval)
 *
 * GET  ?familyId=         → { shoppingList: ShoppingItem[] }
 * PUT  { familyId?, shoppingList: ShoppingItem[] }
 *                         → { shoppingList: ShoppingItem[] }
 *
 * Client computes the list (generateShoppingList) then PUTs the full list.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_FAMILY_ID,
  getShoppingList,
  saveShoppingList,
} from "@/db/kitchen-repo";
import type { ShoppingItem, StoreAisle } from "@/lib/types";

export const dynamic = "force-dynamic";

const AISLES: StoreAisle[] = [
  "produce",
  "meat",
  "dairy",
  "bakery",
  "pantry",
  "frozen",
  "other",
];

function resolveFamilyId(raw: string | null | undefined): string {
  return raw?.trim() || DEFAULT_FAMILY_ID;
}

function normalizeItem(raw: Partial<ShoppingItem>, index: number): ShoppingItem | null {
  const name = raw.name?.trim();
  if (!name) return null;
  const aisle =
    raw.aisle && AISLES.includes(raw.aisle) ? raw.aisle : ("other" as StoreAisle);
  return {
    id: raw.id?.trim() || `shop-${crypto.randomUUID().slice(0, 8)}-${index}`,
    name,
    amount: typeof raw.amount === "number" ? raw.amount : 0,
    unit: typeof raw.unit === "string" ? raw.unit : "",
    aisle,
    checked: Boolean(raw.checked),
    fromRecipes: Boolean(raw.fromRecipes),
  };
}

export async function GET(req: NextRequest) {
  try {
    const familyId = resolveFamilyId(req.nextUrl.searchParams.get("familyId"));
    const shoppingList = await getShoppingList(familyId);
    return NextResponse.json(
      { shoppingList },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load shopping list";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      familyId?: string;
      shoppingList?: Partial<ShoppingItem>[];
    };
    const familyId = resolveFamilyId(body.familyId);
    if (!Array.isArray(body.shoppingList)) {
      return NextResponse.json(
        { error: "shoppingList array is required" },
        { status: 400 },
      );
    }

    const items: ShoppingItem[] = [];
    for (let i = 0; i < body.shoppingList.length; i++) {
      const item = normalizeItem(body.shoppingList[i], i);
      if (item) items.push(item);
    }

    const shoppingList = await saveShoppingList(familyId, items);
    return NextResponse.json({ shoppingList });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save shopping list";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
