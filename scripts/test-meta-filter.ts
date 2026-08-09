import {
  filterIngredientObjects,
  isChromeIngredient,
  isRecipeMetaLine,
  smartParseIngredient,
} from "../src/lib/ingredients";

const lines = [
  "Як приготувати традиційний андалузький гаспачо",
  "Складність: середня",
  "Загальний час",
  "год 15 хв",
  "Розробка",
  "15 хв",
  "хв",
  "Відпочинок",
  "h",
  "Помідори — 1 кг",
  "Огірок — 1 шт",
  "Оливкова олія — 100 мл",
];

for (const l of lines) {
  console.log(l, "→ chrome", isChromeIngredient(l), "meta", isRecipeMetaLine(l));
}

const filtered = filterIngredientObjects(lines.map(smartParseIngredient));
console.log(
  "filtered:",
  filtered.map((i) => `${i.amount} ${i.unit} ${i.name}`.trim()),
);
