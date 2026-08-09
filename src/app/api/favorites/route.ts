/**
 * /api/favorites — demo auth via userId query/body
 *
 * GET  ?userId=           → { favorites: string[] }  (recipe ids)
 * PUT  { userId, recipeId, favorited: boolean }
 *                         → { favorites: string[], favorited: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { getFavorites, setFavorite } from "@/db/kitchen-repo";

export const dynamic = "force-dynamic";

async function favoriteIds(userId: string): Promise<string[]> {
  const rows = await getFavorites(userId);
  return rows.map((f) => f.recipeId);
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId")?.trim();
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    const favorites = await favoriteIds(userId);
    return NextResponse.json(
      { favorites },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load favorites";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      userId?: string;
      recipeId?: string;
      favorited?: boolean;
    };
    const userId = body.userId?.trim();
    const recipeId = body.recipeId?.trim();
    if (!userId || !recipeId) {
      return NextResponse.json(
        { error: "userId and recipeId are required" },
        { status: 400 },
      );
    }
    if (typeof body.favorited !== "boolean") {
      return NextResponse.json(
        { error: "favorited (boolean) is required" },
        { status: 400 },
      );
    }

    await setFavorite(userId, recipeId, body.favorited);
    const favorites = await favoriteIds(userId);
    return NextResponse.json({ favorites, favorited: body.favorited });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update favorite";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
