import { NextRequest, NextResponse } from "next/server";
import { extractRecipeFromUrl } from "@/lib/extract";
import { translateRecipeToUkrainian } from "@/lib/translate";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { url?: string };
    const url = body.url?.trim();
    if (!url) {
      return NextResponse.json({ error: "Вкажіть URL" }, { status: 400 });
    }

    const extracted = await extractRecipeFromUrl(url);
    const recipe = await translateRecipeToUkrainian(extracted);
    return NextResponse.json({ recipe });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Помилка імпорту";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
