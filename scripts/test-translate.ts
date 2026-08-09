import { translateToUkrainian } from "../src/lib/translate";

async function main() {
  for (const q of [
    "Agua",
    "Sal",
    "Агуа",
    "Сал",
    "agua",
    "aceite de oliva",
    "ajo",
    "tomate",
    "вода",
    "сіль",
  ]) {
    const r = await translateToUkrainian(q);
    console.log(JSON.stringify(q), "->", JSON.stringify(r.text), r.lang, r.translated);
  }
}

main().catch(console.error);
