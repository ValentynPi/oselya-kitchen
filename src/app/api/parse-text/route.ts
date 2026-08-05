import { NextRequest, NextResponse } from "next/server";
import { enrichRecipeWithAi } from "@/lib/ai-enrich";
import { parseRecipeFromText } from "@/lib/parse-text";
import { translateRecipeToUkrainian } from "@/lib/translate";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { text?: string };
    const text = body.text?.trim();
    if (!text) {
      return NextResponse.json({ error: "Вставте текст рецепта" }, { status: 400 });
    }
    if (text.length > 20000) {
      return NextResponse.json({ error: "Текст занадто довгий" }, { status: 400 });
    }

    const parsed = parseRecipeFromText(text);
    const translated = await translateRecipeToUkrainian(parsed);
    const recipe = await enrichRecipeWithAi(translated);
    return NextResponse.json({ recipe });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Не вдалося розібрати текст";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
