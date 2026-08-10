import { NextRequest, NextResponse } from "next/server";
import { enrichRecipeWithAi } from "@/lib/ai-enrich";
import { extractRecipeFromUrl } from "@/lib/extract";
import { translateRecipeToUkrainian } from "@/lib/translate";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { url?: string };
    const url = body.url?.trim();
    if (!url) {
      return NextResponse.json({ error: "Вкажіть URL" }, { status: 400 });
    }

    const extracted = await extractRecipeFromUrl(url);
    const translated = await translateRecipeToUkrainian(extracted);
    const recipe = await enrichRecipeWithAi(translated);
    return NextResponse.json({ recipe });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Помилка імпорту";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
