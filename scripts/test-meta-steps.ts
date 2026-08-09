import { isRecipeMetaLine, isChromeIngredient } from "../src/lib/ingredients";

const samples = [
  ["Cook the onions until soft", false],
  ["Rest the dough for 1 hour", false],
  ["Marinate overnight in the fridge", false],
  ["Prep the garlic and herbs carefully", false],
  ["Загальний час", true],
  ["Розробка", true],
  ["Відпочинок", true],
  ["Складність: середня", true],
  ["15 хв", true],
  ["Як приготувати традиційний андалузький гаспачо", true],
  ["Помідори — 1 кг", false],
] as const;

let failed = 0;
for (const [line, expectMeta] of samples) {
  const meta = isRecipeMetaLine(line);
  const chrome = isChromeIngredient(line);
  const ok = meta === expectMeta;
  if (!ok) failed++;
  console.log(
    (ok ? "OK" : "FAIL"),
    JSON.stringify(line),
    "meta=",
    meta,
    "chrome=",
    chrome,
    "wantMeta=",
    expectMeta,
  );
}
process.exit(failed ? 1 : 0);
