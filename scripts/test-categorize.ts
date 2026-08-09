import { suggestCategoryName, suggestDrinkSubgroup, suggestMealTypes } from "../src/lib/ai";

const cases: { title: string; ingredients?: string[]; want: string }[] = [
  {
    title: "Традиційний андалузький гаспачо",
    ingredients: ["Помідори", "Хліб", "Олія", "Вода", "Сіль"],
    want: "Супи",
  },
  { title: "Борщ український", ingredients: ["Буряк", "Капуста"], want: "Супи" },
  { title: "Цезар салат", ingredients: ["Курка", "Салат"], want: "Салати" },
  { title: "Greek salad", ingredients: ["Feta", "Tomato"], want: "Салати" },
  { title: "Chocolate brownie", ingredients: ["Chocolate", "Butter"], want: "Десерти" },
  { title: "Sourdough bread", ingredients: ["Flour", "Starter"], want: "Випічка" },
  { title: "Honey almond granola", ingredients: ["Oats", "Honey"], want: "Сніданки" },
  { title: "Banana smoothie", ingredients: ["Banana", "Milk"], want: "Напої" },
  { title: "Spaghetti carbonara", ingredients: ["Pasta", "Egg", "Bacon"], want: "Основні страви" },
  { title: "Куряче філе на грилі", ingredients: ["Курка", "Олія"], want: "Основні страви" },
  { title: "Омлет з сиром", ingredients: ["Яйця", "Сир"], want: "Сніданки" },
  { title: "Зелений чай з м'ятою", ingredients: ["Чай", "М'ята"], want: "Напої" },
  { title: "Млинці з варенням", ingredients: ["Борошно", "Молоко"], want: "Сніданки" },
  { title: "Лазанья болоньєзе", ingredients: ["Pasta", "Beef"], want: "Основні страви" },
];

let failed = 0;
for (const c of cases) {
  const got = suggestCategoryName({
    title: c.title,
    description: "",
    ingredients: (c.ingredients ?? []).map((name) => ({
      name,
      amount: 1,
      unit: "",
      aisle: "other",
    })),
    mealTypes: ["dinner"],
    steps: [],
  });
  const ok = got === c.want;
  if (!ok) failed++;
  console.log(ok ? "OK" : "FAIL", c.title, "→", got, ok ? "" : `(want ${c.want})`);
}

const drink = suggestDrinkSubgroup({
  title: "Banana smoothie",
  description: "",
  ingredients: [{ name: "Banana", amount: 1, unit: "", aisle: "produce" }],
});
console.log("drink subgroup smoothie →", drink);

console.log("meal breakfast →", suggestMealTypes("Сніданки", ["dinner"]));
process.exit(failed ? 1 : 0);
