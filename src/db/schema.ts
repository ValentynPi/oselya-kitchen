import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  parentId: text("parent_id"),
});

export const recipes = sqliteTable("recipes", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  categoryId: text("category_id").notNull(),
  subcategoryId: text("subcategory_id"),
  authorId: text("author_id").notNull(),
  authorName: text("author_name").notNull(),
  visibility: text("visibility").notNull().default("shared"),
  sourceUrl: text("source_url"),
  ingredients: text("ingredients").notNull(),
  steps: text("steps").notNull(),
  imageUrl: text("image_url").notNull().default(""),
  cookTimeMinutes: integer("cook_time_minutes").notNull(),
  mealTypes: text("meal_types").notNull(),
  dietTags: text("diet_tags").notNull(),
  cookMethods: text("cook_methods").notNull(),
  servings: integer("servings").notNull(),
  createdAt: text("created_at").notNull(),
});

export const favorites = sqliteTable(
  "favorites",
  {
    userId: text("user_id").notNull(),
    recipeId: text("recipe_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.recipeId] })],
);

export const mealPlanEntries = sqliteTable("meal_plan_entries", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  mealType: text("meal_type").notNull(),
  recipeId: text("recipe_id").notNull(),
  servings: integer("servings").notNull(),
  familyId: text("family_id").notNull().default("family-koval"),
});

export const shoppingItems = sqliteTable("shopping_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  amount: real("amount").notNull(),
  unit: text("unit").notNull(),
  aisle: text("aisle").notNull(),
  checked: integer("checked", { mode: "boolean" }).notNull().default(false),
  fromRecipes: text("from_recipes").notNull(),
  familyId: text("family_id").notNull().default("family-koval"),
});

export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type CategoryRow = typeof categories.$inferSelect;
export type RecipeRow = typeof recipes.$inferSelect;
export type FavoriteRow = typeof favorites.$inferSelect;
export type MealPlanEntryRow = typeof mealPlanEntries.$inferSelect;
export type ShoppingItemRow = typeof shoppingItems.$inferSelect;
