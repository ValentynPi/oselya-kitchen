import { NextRequest, NextResponse } from "next/server";
import { ensureCategory } from "@/lib/ai";
import { getKitchen, saveKitchen } from "@/db/kitchen-repo";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { name?: string };
    const name = body.name?.trim().replace(/\s+/g, " ");
    if (!name) {
      return NextResponse.json({ error: "Вкажіть назву категорії" }, { status: 400 });
    }
    if (name.length > 40) {
      return NextResponse.json({ error: "Назва задовга (до 40 символів)" }, { status: 400 });
    }

    const kitchen = await getKitchen();
    const ensured = ensureCategory(kitchen.categories, name);
    const next = await saveKitchen({
      ...kitchen,
      categories: ensured.categories,
      updatedAt: new Date().toISOString(),
    });
    const category = next.categories.find((c) => c.id === ensured.categoryId);

    return NextResponse.json({ kitchen: next, category });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Помилка збереження категорії";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
