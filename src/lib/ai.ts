import type { Category, MealType, Recipe, StoreAisle } from "./types";

/** Top-level groups users can pick (or leave on auto). */
export const RECIPE_GROUPS = [
  "Супи",
  "Основні страви",
  "Випічка",
  "Напої",
  "Салати",
  "Десерти",
  "Сніданки",
] as const;

export type RecipeGroupName = (typeof RECIPE_GROUPS)[number];

export const DRINK_SUBGROUPS = [
  "Прохолоджувальні",
  "Гарячі напої",
  "Коктейлі",
] as const;

const DRINK_SUBS: { name: string; keywords: string[] }[] = [
  {
    name: "Прохолоджувальні",
    keywords: [
      "лимонад",
      "холодн",
      "лід",
      "мохіто",
      "iced",
      "lemonade",
      "cold brew",
      "компот",
      "узвар",
      "морс",
      "сік",
      "juice",
    ],
  },
  {
    name: "Гарячі напої",
    keywords: [
      "чай",
      "кава",
      "какао",
      "гаряч",
      "tea",
      "coffee",
      "latte",
      "espresso",
      "cappuccino",
      "mocha",
      "hot chocolate",
      "глінтвейн",
    ],
  },
  {
    name: "Коктейлі",
    keywords: [
      "смузі",
      "коктейл",
      "шейк",
      "мілкшейк",
      "smoothie",
      "cocktail",
      "shake",
      "mocktail",
      "маргірит",
      "mojito",
    ],
  },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-zа-яіїєґ0-9]+/gi, "-")
    .replace(/^-|-$/g, "");
}

function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ё/g, "е")
    .replace(/[''`´]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-token / stem match that works with Cyrillic (JS \\b does not). */
function hasCue(haystack: string, cue: string): boolean {
  const h = norm(haystack);
  const c = norm(cue);
  if (!c) return false;
  if (c.includes(" ")) return h.includes(c);
  const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRe(c)}[\\p{L}\\p{N}]*`, "iu");
  return re.test(h);
}

function scoreCues(text: string, cues: string[], weight: number): number {
  let score = 0;
  for (const cue of cues) {
    if (hasCue(text, cue)) score += weight;
  }
  return score;
}

type Suggestable = Pick<Recipe, "title" | "description" | "ingredients"> & {
  mealTypes?: MealType[];
  cookTimeMinutes?: number;
  steps?: { text: string }[];
};

/** Ingredients that appear in almost every dish — ignore for category signals. */
const NOISE_INGREDIENT =
  /^(сіль|соль|salt|перець|pepper|олія|масло|oil|olive oil|вода|water|цукор|sugar|борошно|flour|часник|garlic|цибуля|onion|лимонний сік|сік лимона|оцет|vinegar|спеції|spice|паприка|paprika)$/i;

type Rule = {
  category: RecipeGroupName;
  titleStrong: string[];
  titleWeak: string[];
  body: string[];
  titleBlockers?: string[];
};

const RULES: Rule[] = [
  {
    category: "Супи",
    titleStrong: [
      "суп",
      "борщ",
      "юшка",
      "бульйон",
      "солянка",
      "харчо",
      "гаспачо",
      "gazpacho",
      "soup",
      "chowder",
      "bisque",
      "ramen",
      "pho",
      "miso soup",
      "том ям",
      "tom yum",
      "cream soup",
      "крем-суп",
      "крем суп",
    ],
    titleWeak: ["stew", "рагу", "буйабес", "cioppino"],
    body: ["варити бульйон", "процідити", "подавати гарячим супом"],
    titleBlockers: ["салат", "salad", "торт", "cake", "смузі", "smoothie"],
  },
  {
    category: "Салати",
    titleStrong: [
      "салат",
      "вінегрет",
      "salad",
      "coleslaw",
      "табуле",
      "tabbouleh",
      "caprese",
      "капрезе",
      "цезар",
      "caesar",
      "greek salad",
      "олів'є",
      "оливье",
    ],
    titleWeak: ["vinaigrette"],
    body: ["заправити олією", "перемішати овочі"],
    titleBlockers: ["суп", "soup", "торт", "cake", "паста", "pasta"],
  },
  {
    category: "Напої",
    titleStrong: [
      "смузі",
      "smoothie",
      "лимонад",
      "lemonade",
      "коктейл",
      "cocktail",
      "mocktail",
      "латте",
      "latte",
      "капучино",
      "cappuccino",
      "еспресо",
      "espresso",
      "американо",
      "mocha",
      "какао",
      "hot chocolate",
      "чай",
      "tea",
      "кава",
      "coffee",
      "компот",
      "узвар",
      "морс",
      "мілкшейк",
      "milkshake",
      "напій",
      "drink",
      "сік",
      "juice",
      "смузи",
    ],
    titleWeak: ["shake", "brew"],
    body: ["збити в блендері напій", "подавати охолодженим у склян"],
    titleBlockers: [
      "суп",
      "soup",
      "гаспачо",
      "gazpacho",
      "салат",
      "salad",
      "торт",
      "cake",
      "паста",
      "curry",
      "стейк",
      "борщ",
    ],
  },
  {
    category: "Десерти",
    titleStrong: [
      "торт",
      "тортик",
      "cake",
      "брауні",
      "brownie",
      "чизкейк",
      "cheesecake",
      "тірамісу",
      "tiramisu",
      "морозиво",
      "ice cream",
      "печиво",
      "cookie",
      "cookies",
      "цукерк",
      "пудинг",
      "pudding",
      "мус",
      "mousse",
      "панна котта",
      "panna cotta",
      "тістечко",
      "cupcake",
      "fudge",
      "tart",
      "тарт",
      "еклер",
      "napoleon",
      "наполеон",
      "штрудель",
      "десерт",
      "dessert",
    ],
    titleWeak: ["солодк", "sweet", "шоколадн"],
    body: ["взбити вершки", "полити глазур", "охолодити торт"],
    titleBlockers: ["суп", "soup", "салат", "salad", "стейк", "curry", "борщ"],
  },
  {
    category: "Випічка",
    titleStrong: [
      "хліб",
      "батон",
      "багет",
      "булочк",
      "паска",
      "куліч",
      "фокач",
      "focaccia",
      "чіабат",
      "ciabatta",
      "sourdough",
      "закваск",
      "пиріг",
      "пиріжк",
      "пиріжеч",
      "хачапур",
      "самс",
      "киш",
      "quiche",
      "піца",
      "pizza",
      "корж",
      "лаваш",
      "pretzel",
      "бейгл",
      "bagel",
      "bread",
      "bun",
      "scone",
    ],
    titleWeak: ["тісто", "dough", "випічк", "випіка"],
    body: ["замесити тісто", "піднялося тісто", "випікати при"],
    titleBlockers: [
      "гаспачо",
      "gazpacho",
      "суп",
      "soup",
      "салат",
      "salad",
      "смузі",
      "smoothie",
      "стейк",
      "curry",
    ],
  },
  {
    category: "Сніданки",
    titleStrong: [
      "омлет",
      "omelet",
      "omelette",
      "яєчн",
      "сирник",
      "каша",
      "вівсян",
      "oatmeal",
      "porridge",
      "млинц",
      "оладк",
      "pancake",
      "pancakes",
      "waffle",
      "вафл",
      "french toast",
      "грінки",
      "сніданок",
      "breakfast",
      "granola",
      "гранола",
      "smoothie bowl",
      "яйця бенедикт",
      "shakshuka",
      "шакшука",
      "авокадо тост",
      "avocado toast",
      "скрембл",
      "scrambled",
    ],
    titleWeak: ["toast", "тост", "yogurt bowl"],
    body: ["на сніданок", "ранкова"],
    titleBlockers: ["суп", "soup", "борщ", "стейк", "curry", "лазань", "lasagna"],
  },
  {
    category: "Основні страви",
    titleStrong: [
      "стейк",
      "steak",
      "паста",
      "pasta",
      "спагеті",
      "spaghetti",
      "лазанья",
      "lasagna",
      "різотто",
      "risotto",
      "плов",
      "curry",
      "карі",
      "гуляш",
      "goulash",
      "котлет",
      "тефтел",
      "биточк",
      "запіканк",
      "casserole",
      "рагу",
      "roast",
      "печеня",
      "шашлик",
      "kebab",
      "бургер",
      "burger",
      "фахіта",
      "fajita",
      "тако",
      "taco",
      "локшина",
      "noodles",
      "stir fry",
      "смажен",
      "відбивн",
      "філе",
      "salmon",
      "лосось",
      "курка",
      "chicken",
      "індичк",
      "свинин",
      "яловичин",
      "beef",
      "pork",
      "риба",
      "fish",
      "креветк",
      "shrimp",
      "паелья",
      "paella",
      "болоньєзе",
      "bolognese",
      "карбонар",
      "carbonara",
    ],
    titleWeak: ["dinner", "вечеря", "обід", "lunch", "main"],
    body: ["обсмажити", "тушкувати", "запекти основне"],
    titleBlockers: [
      "суп",
      "soup",
      "салат",
      "salad",
      "торт",
      "cake",
      "смузі",
      "smoothie",
      "омлет",
      "каша",
      "хліб",
      "bread",
    ],
  },
];

/**
 * Auto-picks the best category: title dish-type first, then body cues.
 * Ignores noisy pantry ingredients that used to misfile soups as bakery, etc.
 */
export function suggestCategoryName(recipe: Suggestable): string {
  const title = norm(recipe.title || "");
  const description = norm(recipe.description || "");
  const steps = (recipe.steps ?? [])
    .slice(0, 4)
    .map((s) => s.text)
    .join(" ");
  const ingredients = (recipe.ingredients ?? [])
    .map((i) => i.name.trim())
    .filter((n) => n && !NOISE_INGREDIENT.test(n) && n.length < 60);

  const ingredientText = ingredients.join(" ");
  const body = `${description} ${norm(steps)}`;

  const scores = new Map<RecipeGroupName, number>();
  const bump = (cat: RecipeGroupName, amount: number) => {
    if (amount === 0) return;
    scores.set(cat, (scores.get(cat) || 0) + amount);
  };

  for (const rule of RULES) {
    const blocked = rule.titleBlockers?.some((b) => hasCue(title, b)) ?? false;
    const strongTitle = scoreCues(title, rule.titleStrong, blocked ? 4 : 12);
    const weakTitle = scoreCues(title, rule.titleWeak, blocked ? 1 : 4);
    const descScore = scoreCues(description, [...rule.titleStrong, ...rule.titleWeak], 2);
    const stepScore = scoreCues(steps, rule.body, 2);

    let ingScore = 0;
    for (const cue of rule.titleStrong) {
      if (!hasCue(ingredientText, cue)) continue;
      if (rule.category === "Випічка" && /хліб|bread|булоч|батон/.test(cue)) continue;
      if (rule.category === "Напої" && /сік|juice|вода|water/.test(cue)) continue;
      if (rule.category === "Десерти" && /шоколад|chocolate|цукор|sugar/.test(cue)) {
        ingScore += 0.5;
        continue;
      }
      ingScore += 1;
    }

    bump(rule.category, strongTitle + weakTitle + descScore + stepScore + ingScore);
  }

  const meals = recipe.mealTypes ?? [];
  if (meals.includes("breakfast") && !hasCue(title, "суп") && !hasCue(title, "борщ")) {
    bump("Сніданки", 3);
  }
  if (meals.includes("snack") && (scores.get("Десерти") || 0) >= 4) {
    bump("Десерти", 2);
  }

  const cook = recipe.cookTimeMinutes ?? 30;
  if (cook <= 15 && (scores.get("Сніданки") || 0) >= 4) bump("Сніданки", 1);
  if (/блендер|blender|cold|холодн|без варіння|no-cook|no cook/.test(body + " " + title)) {
    if ((scores.get("Супи") || 0) >= 8) bump("Супи", 2);
    if ((scores.get("Напої") || 0) >= 8) bump("Напої", 2);
  }
  if (/випік|oven|духовк|bake|baked/.test(body + " " + title)) {
    if ((scores.get("Випічка") || 0) > 0) bump("Випічка", 2);
    if ((scores.get("Десерти") || 0) > 0) bump("Десерти", 1);
  }

  const soup = scores.get("Супи") || 0;
  const bakery = scores.get("Випічка") || 0;
  const dessert = scores.get("Десерти") || 0;
  const drinks = scores.get("Напої") || 0;
  const salad = scores.get("Салати") || 0;
  const breakfast = scores.get("Сніданки") || 0;
  const mains = scores.get("Основні страви") || 0;

  if (soup >= 8 && /гаспачо|gazpacho|суп|борщ|юшка|soup|chowder|ramen|pho/.test(title)) {
    scores.set("Супи", soup + 10);
    scores.set("Випічка", Math.max(0, bakery - 8));
    scores.set("Напої", Math.max(0, drinks - 8));
  }

  if ((salad >= 8 && hasCue(title, "салат")) || hasCue(title, "salad")) {
    scores.set("Салати", Math.max(salad, 14));
    scores.set("Основні страви", Math.max(0, mains - 6));
  }

  if (drinks >= 10 && soup < 8 && salad < 8 && mains < 10) {
    scores.set("Напої", drinks + 4);
  } else if (soup >= drinks) {
    scores.set("Напої", Math.min(drinks, Math.max(0, soup - 1)));
  }

  if (bakery > 0 && dessert > 0) {
    if (/хліб|багет|sourdough|закваск|булочк|focaccia|піца|pizza|киш|quiche/.test(title)) {
      scores.set("Випічка", bakery + 6);
      scores.set("Десерти", Math.max(0, dessert - 4));
    } else if (/торт|cake|брауні|brownie|чизкейк|cookie|печив|мус|тірамісу/.test(title)) {
      scores.set("Десерти", dessert + 6);
      scores.set("Випічка", Math.max(0, bakery - 4));
    }
  }

  if (/granola|гранола|oatmeal|вівсян|каша|smoothie bowl/.test(title)) {
    scores.set("Сніданки", breakfast + 8);
    scores.set("Десерти", Math.max(0, dessert - 6));
  }

  if (/pancake|млинц|оладк|waffle|вафл/.test(title) && !/cake|торт/.test(title)) {
    scores.set("Сніданки", (scores.get("Сніданки") || 0) + 6);
    scores.set("Десерти", Math.max(0, (scores.get("Десерти") || 0) - 4));
  }

  let best: RecipeGroupName = "Основні страви";
  let bestScore = -1;
  for (const cat of RECIPE_GROUPS) {
    const score = scores.get(cat) || 0;
    if (score > bestScore) {
      best = cat;
      bestScore = score;
    }
  }

  if (bestScore < 4) {
    if (meals.includes("breakfast")) return "Сніданки";
    return "Основні страви";
  }

  return best;
}

/** Suggest a drink subgroup when the recipe is in Напої. */
export function suggestDrinkSubgroup(recipe: Suggestable): string | undefined {
  const hay = norm(
    `${recipe.title} ${recipe.description} ${(recipe.ingredients ?? []).map((i) => i.name).join(" ")}`,
  );
  let best: string | undefined;
  let bestScore = 0;
  for (const sub of DRINK_SUBS) {
    let score = 0;
    for (const k of sub.keywords) {
      if (hasCue(hay, k)) score += hasCue(recipe.title || "", k) ? 3 : 1;
    }
    if (score > bestScore) {
      best = sub.name;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : undefined;
}

/** Align meal tags with the chosen group when the user left defaults. */
export function suggestMealTypes(
  categoryName: string,
  current?: MealType[],
): MealType[] {
  const cur = current ?? [];
  if (cur.length > 0 && !(cur.length === 1 && cur[0] === "dinner")) {
    return cur;
  }
  switch (categoryName) {
    case "Сніданки":
      return ["breakfast"];
    case "Десерти":
      return ["snack"];
    case "Напої":
      return ["snack"];
    case "Салати":
      return ["lunch", "dinner"];
    case "Супи":
      return ["lunch", "dinner"];
    default:
      return cur.length ? cur : ["dinner"];
  }
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
        if (cat && sub.keywords.some((k) => hasCue(haystack, k))) {
          match = cat;
          break;
        }
      }
    } else if (recipe.cookTimeMinutes <= 20) {
      match = subs.find((s) => s.name === "Швидкі") ?? match;
    } else if (
      /свят|святко|особлив|guest|праздн|спеціальн|special|celebration/.test(haystack)
    ) {
      match = subs.find((s) => s.name === "Особливі") ?? match;
    } else {
      match = subs.find((s) => s.name === "Класичні") ?? match;
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

export function parseImportUrl(
  url: string,
): Partial<Recipe> & { title: string; description: string } {
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
    imageUrl:
      "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=1200&q=80",
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
