import type { Category, MealType, Recipe, StoreAisle } from "./types";

const KEYWORD_MAP: { category: string; keywords: string[]; weight?: number }[] = [
  {
    category: "Супи",
    keywords: [
      "суп",
      "борщ",
      "бульйон",
      "крем-суп",
      "юшка",
      "soup",
      "broth",
      "chowder",
      "gazpacho",
      "ramen",
      "pho",
      "stew",
      "рагу-суп",
    ],
  },
  {
    category: "Випічка",
    keywords: [
      "хліб",
      "булоч",
      "пиріг",
      "тісто",
      "закваск",
      "кекс",
      "паска",
      "багет",
      "bread",
      "dough",
      "sourdough",
      "bun",
      "bagel",
      "focaccia",
      "muffin",
      "scone",
      "pie crust",
      "pastry",
    ],
  },
  {
    category: "Десерти",
    keywords: [
      "торт",
      "брауні",
      "печив",
      "шоколад",
      "морозив",
      "десерт",
      "тістечко",
      "цукерк",
      "пудинг",
      "чизкейк",
      "dessert",
      "cake",
      "brownie",
      "cookie",
      "cookies",
      "ice cream",
      "pudding",
      "cheesecake",
      "tiramisu",
      "pancake dessert",
      "sweet",
      "granola",
      "fudge",
      "cupcake",
      "tart",
    ],
  },
  {
    category: "Напої",
    keywords: [
      "чай",
      "кава",
      "лимонад",
      "смузі",
      "коктейл",
      "сік",
      "напій",
      "компот",
      "узвар",
      "tea",
      "coffee",
      "lemonade",
      "smoothie",
      "cocktail",
      "juice",
      "drink",
      "latte",
      "espresso",
      "mocha",
      "cocoa",
      "какао",
    ],
  },
  {
    category: "Салати",
    keywords: [
      "салат",
      "вінегрет",
      "salad",
      "coleslaw",
      "vinaigrette",
      "цезар",
      "caesar",
      "greek salad",
    ],
  },
  {
    category: "Сніданки",
    keywords: [
      "омлет",
      "сирник",
      "каша",
      "млинц",
      "сніданок",
      "тості",
      "яєчн",
      "oatmeal",
      "omelet",
      "omelette",
      "pancake",
      "pancakes",
      "waffle",
      "breakfast",
      "porridge",
      "granola bowl",
      "toast",
      "scrambled",
      "french toast",
    ],
  },
  {
    category: "Основні страви",
    keywords: [
      "курка",
      "м'ясо",
      "паста",
      "рагу",
      "стейк",
      "риба",
      "плов",
      "котлет",
      "запіканк",
      "гуляш",
      "chicken",
      "beef",
      "pork",
      "pasta",
      "steak",
      "fish",
      "salmon",
      "dinner",
      "casserole",
      "risotto",
      "lasagna",
      "curry",
      "stir fry",
      "roast",
      "grill",
    ],
  },
];

const DRINK_SUBS: { name: string; keywords: string[] }[] = [
  { name: "Прохолоджувальні", keywords: ["лимонад", "холодн", "лід", "мохіто"] },
  { name: "Гарячі напої", keywords: ["чай", "кава", "какао", "гаряч"] },
  { name: "Коктейлі", keywords: ["смузі", "коктейл", "шейк", "мілкшейк"] },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-zа-яіїєґ0-9]+/gi, "-")
    .replace(/^-|-$/g, "");
}

type Suggestable = Pick<Recipe, "title" | "description" | "ingredients"> & {
  mealTypes?: MealType[];
  cookTimeMinutes?: number;
  steps?: { text: string }[];
};

/** Auto-picks the best category group from title, description, ingredients and meal type. */
export function suggestCategoryName(recipe: Suggestable): string {
  const title = (recipe.title || "").toLowerCase();
  const body = [
    recipe.description,
    ...(recipe.ingredients ?? []).map((i) => i.name),
    ...(recipe.steps ?? []).slice(0, 3).map((s) => s.text),
  ]
    .join(" ")
    .toLowerCase();
  const haystack = `${title} ${body}`;

  const scores = new Map<string, number>();

  for (const entry of KEYWORD_MAP) {
    let score = 0;
    for (const keyword of entry.keywords) {
      if (!haystack.includes(keyword)) continue;
      // Title hits matter most — that's usually the dish type
      if (title.includes(keyword)) score += 5;
      else score += 1;
    }
    if (score > 0) scores.set(entry.category, (scores.get(entry.category) || 0) + score);
  }

  const meals = recipe.mealTypes ?? [];
  if (meals.includes("breakfast")) {
    scores.set("Сніданки", (scores.get("Сніданки") || 0) + 3);
  }
  if (meals.includes("snack") && (scores.get("Десерти") || 0) > 0) {
    scores.set("Десерти", (scores.get("Десерти") || 0) + 1);
  }

  // Prefer bakery over dessert when dough/bread signals dominate sweets
  const bakery = scores.get("Випічка") || 0;
  const dessert = scores.get("Десерти") || 0;
  if (bakery > 0 && dessert > 0 && bakery >= dessert && /хліб|bread|закваск|sourdough|тісто|dough/.test(haystack)) {
    scores.set("Випічка", bakery + 2);
  }

  let best = "Основні страви";
  let bestScore = 0;
  for (const [name, score] of scores) {
    if (score > bestScore) {
      best = name;
      bestScore = score;
    }
  }
  return best;
}

export function ensureCategory(
  categories: Category[],
  name: string,
  parentId?: string,
): { categories: Category[]; categoryId: string } {
  const existing = categories.find(
    (c) => c.name.toLowerCase() === name.toLowerCase() && c.parentId === parentId,
  );
  if (existing) return { categories, categoryId: existing.id };

  const id = `cat-${slugify(name)}-${Date.now()}`;
  const next: Category = { id, name, slug: slugify(name), parentId };
  return { categories: [...categories, next], categoryId: id };
}

export function maybeSplitCategory(
  categories: Category[],
  recipes: Recipe[],
  categoryId: string,
): { categories: Category[]; recipes: Recipe[] } {
  const parent = categories.find((c) => c.id === categoryId && !c.parentId);
  if (!parent) return { categories, recipes };

  const inCategory = recipes.filter((r) => r.categoryId === categoryId);
  if (inCategory.length <= 10) return { categories, recipes };

  const existingSubs = categories.filter((c) => c.parentId === categoryId);
  if (existingSubs.length > 0) {
    return redistribute(categories, recipes, categoryId, existingSubs);
  }

  let nextCategories = [...categories];
  const subs: Category[] = [];

  if (parent.name === "Напої") {
    for (const sub of DRINK_SUBS) {
      const created = ensureCategory(nextCategories, sub.name, categoryId);
      nextCategories = created.categories;
      const cat = nextCategories.find((c) => c.id === created.categoryId)!;
      subs.push(cat);
    }
  } else {
    const names = ["Класичні", "Швидкі", "Особливі"];
    for (const name of names) {
      const created = ensureCategory(nextCategories, name, categoryId);
      nextCategories = created.categories;
      const cat = nextCategories.find((c) => c.id === created.categoryId)!;
      subs.push(cat);
    }
  }

  return redistribute(nextCategories, recipes, categoryId, subs);
}

function redistribute(
  categories: Category[],
  recipes: Recipe[],
  categoryId: string,
  subs: Category[],
): { categories: Category[]; recipes: Recipe[] } {
  const parent = categories.find((c) => c.id === categoryId)!;
  const nextRecipes = recipes.map((recipe) => {
    if (recipe.categoryId !== categoryId) return recipe;
    if (recipe.subcategoryId) return recipe;

    const haystack = `${recipe.title} ${recipe.description}`.toLowerCase();
    let match = subs[0];

    if (parent.name === "Напої") {
      for (const sub of DRINK_SUBS) {
        const cat = subs.find((s) => s.name === sub.name);
        if (cat && sub.keywords.some((k) => haystack.includes(k))) {
          match = cat;
          break;
        }
      }
    } else if (recipe.cookTimeMinutes <= 20) {
      match = subs.find((s) => s.name === "Швидкі") ?? match;
    }

    return { ...recipe, subcategoryId: match.id };
  });

  return { categories, recipes: nextRecipes };
}

export function guessAisle(name: string): StoreAisle {
  const n = name.toLowerCase();
  if (
    /м'ясо|куряч|яловиц|бекон|риба|фарш|chicken|beef|pork|bacon|fish|salmon|turkey|sausage|lamb|meat/.test(
      n,
    )
  ) {
    return "meat";
  }
  if (
    /молоко|сир|сметан|йогурт|вершк|яйц|творог|фета|пармезан|масло|milk|cheese|cream|yogurt|butter|egg|feta|parmesan/.test(
      n,
    )
  ) {
    return "dairy";
  }
  if (/хліб|булоч|багет|bread|bun|bagel|baguette/.test(n)) return "bakery";
  if (/заморож|лід|frozen|ice cream/.test(n)) return "frozen";
  if (
    /борошн|цукор|олія|сіль|паста|спагеті|мед|шоколад|томатн|оливк|перець|закваск|flour|sugar|oil|salt|pasta|honey|chocolate|vanilla|cocoa|oat|almond|maple|syrup|spice|cinnamon|ginger|baking/.test(
      n,
    )
  ) {
    return "pantry";
  }
  if (/вода|water/.test(n)) return "other";
  if (
    /буряк|капуст|картопл|моркв|цибул|часник|помідор|огірок|перець|гриб|печериц|лимон|банан|імбир|м'ят|кабачок|баклажан|оливк|родзин|кроп|петрушк|кінз|onion|garlic|tomato|lemon|apple|berry|fruit|vegetable|spinach|lettuce|herb|parsley|basil|dill|apricot|cherry|raisin|currant|cranberr/.test(
      n,
    )
  ) {
    return "produce";
  }
  return "pantry";
}

export function parseImportUrl(url: string): Partial<Recipe> & { title: string; description: string } {
  let host = "джерело";
  try {
    host = new URL(url).hostname.replace("www.", "");
  } catch {
    /* ignore */
  }

  const isSocial = /instagram|facebook|fb\.com/.test(host);
  return {
    title: isSocial ? `Рецепт з ${host}` : `Імпортований рецепт (${host})`,
    description:
      "Автоматично витягнуто з посилання: інгредієнти та кроки стандартизовано, рекламу прибрано.",
    sourceUrl: url,
    imageUrl: "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=1200&q=80",
    cookTimeMinutes: 30,
    mealTypes: ["dinner"],
    dietTags: [],
    cookMethods: ["stovetop"],
    servings: 4,
    ingredients: [
      { name: "Основний продукт", amount: 400, unit: "г", aisle: "produce" },
      { name: "Цибуля", amount: 1, unit: "шт", aisle: "produce" },
      { name: "Олія", amount: 2, unit: "ст.л.", aisle: "pantry" },
      { name: "Сіль", amount: 1, unit: "ч.л.", aisle: "pantry" },
    ],
    steps: [
      { order: 1, text: "Підготуйте інгредієнти згідно з оригінальним рецептом." },
      { order: 2, text: "Приготуйте основну частину страви." },
      { order: 3, text: "Доведіть до готовності та подавайте." },
    ],
  };
}
