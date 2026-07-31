export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type DietTag = "vegetarian" | "vegan" | "gluten-free" | "dairy-free";
export type CookMethod = "oven" | "stovetop" | "multicooker" | "grill" | "no-cook";
export type Visibility = "shared" | "private";
export type StoreAisle =
  | "produce"
  | "meat"
  | "dairy"
  | "bakery"
  | "pantry"
  | "frozen"
  | "other";

export interface Ingredient {
  name: string;
  amount: number;
  unit: string;
  aisle?: StoreAisle;
}

export interface RecipeStep {
  order: number;
  text: string;
  mediaUrl?: string;
}

export interface Category {
  id: string;
  name: string;
  parentId?: string;
  slug: string;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  subcategoryId?: string;
  authorId: string;
  authorName: string;
  visibility: Visibility;
  sourceUrl?: string;
  ingredients: Ingredient[];
  steps: RecipeStep[];
  imageUrl: string;
  cookTimeMinutes: number;
  mealTypes: MealType[];
  dietTags: DietTag[];
  cookMethods: CookMethod[];
  servings: number;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  familyId: string;
}

export interface Favorite {
  userId: string;
  recipeId: string;
}

export interface MealPlanEntry {
  id: string;
  date: string; // yyyy-MM-dd
  mealType: MealType;
  recipeId: string;
  servings: number;
}

export interface ShoppingItem {
  id: string;
  name: string;
  amount: number;
  unit: string;
  aisle: StoreAisle;
  checked: boolean;
  fromRecipes: boolean;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  kind: "text" | "ingredients";
  createdAt: string;
}
