/**
 * Smoke test for favorites / meal-plan / shopping kitchen-repo + route contracts.
 * Run: npx tsx scripts/smoke-kitchen-apis.ts
 */
import {
  DEFAULT_FAMILY_ID,
  addMealPlanEntry,
  getFavorites,
  getMealPlan,
  getShoppingList,
  removeMealPlanEntry,
  saveShoppingList,
  setFavorite,
  toggleFavorite,
  updateMealPlanEntry,
} from "../src/db/kitchen-repo";

const USER = "user-olena";
const FAMILY = DEFAULT_FAMILY_ID;

async function main() {
  const results: Record<string, unknown> = {};

  // Favorites
  await setFavorite(USER, "r1", true);
  await setFavorite(USER, "r3", true);
  let favs = await getFavorites(USER);
  results.favoritesAfterSet = favs.map((f) => f.recipeId).sort();

  const toggledOff = await toggleFavorite(USER, "r3");
  favs = await getFavorites(USER);
  results.toggleOff = { favorited: toggledOff, ids: favs.map((f) => f.recipeId).sort() };

  const toggledOn = await toggleFavorite(USER, "r3");
  favs = await getFavorites(USER);
  results.toggleOn = { favorited: toggledOn, ids: favs.map((f) => f.recipeId).sort() };

  // Meal plan
  const entry = await addMealPlanEntry(
    {
      id: "mp-smoke-1",
      date: "2026-08-10",
      mealType: "dinner",
      recipeId: "r1",
      servings: 4,
    },
    FAMILY,
  );
  results.mealPlanAdded = entry;

  const patched = await updateMealPlanEntry("mp-smoke-1", { servings: 6 });
  results.mealPlanPatched = patched;

  const plan = await getMealPlan(FAMILY);
  results.mealPlanHasEntry = plan.some((e) => e.id === "mp-smoke-1" && e.servings === 6);

  // Shopping
  const list = await saveShoppingList(FAMILY, [
    {
      id: "shop-smoke-1",
      name: "Картопля",
      amount: 500,
      unit: "г",
      aisle: "produce",
      checked: false,
      fromRecipes: true,
    },
    {
      id: "shop-smoke-2",
      name: "Сіль",
      amount: 1,
      unit: "ч.л.",
      aisle: "pantry",
      checked: false,
      fromRecipes: false,
    },
  ]);
  results.shoppingSaved = list.length;

  const loaded = await getShoppingList(FAMILY);
  results.shoppingLoaded = loaded.map((i) => i.id).sort();

  // Replace with subset (full list PUT)
  await saveShoppingList(FAMILY, [
    {
      id: "shop-smoke-1",
      name: "Картопля",
      amount: 500,
      unit: "г",
      aisle: "produce",
      checked: true,
      fromRecipes: true,
    },
  ]);
  const afterReplace = await getShoppingList(FAMILY);
  results.shoppingAfterReplace = afterReplace.map((i) => ({
    id: i.id,
    checked: i.checked,
  }));

  // Cleanup meal plan smoke entry
  const removed = await removeMealPlanEntry("mp-smoke-1");
  results.mealPlanRemoved = removed;

  // Cleanup favorites smoke (leave r1 if desired — reset r3)
  await setFavorite(USER, "r3", false);

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
