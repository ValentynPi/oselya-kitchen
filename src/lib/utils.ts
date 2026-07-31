export const MEAL_LABELS = {
  breakfast: "Сніданок",
  lunch: "Обід",
  dinner: "Вечеря",
  snack: "Перекус",
} as const;

export const DIET_LABELS = {
  vegetarian: "Вегетаріанське",
  vegan: "Веганське",
  "gluten-free": "Безглютенове",
  "dairy-free": "Безмолочне",
} as const;

export const METHOD_LABELS = {
  oven: "Духовка",
  stovetop: "Плита",
  multicooker: "Мультиварка",
  grill: "Гриль",
  "no-cook": "Без термічної обробки",
} as const;

export function formatAmount(amount: number, unit: string): string {
  const rounded = Number.isInteger(amount) ? amount.toString() : amount.toFixed(2).replace(/\.?0+$/, "");
  if (!unit?.trim()) return amount === 1 ? "" : rounded;
  return `${rounded} ${unit}`;
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
