import { extractRecipeFromUrl } from "../src/lib/extract";

async function main() {
  const urls = [
    "https://www.bbcgoodfood.com/recipes/best-ever-chocolate-brownies-recipe",
    "https://cookieandkate.com/honey-almond-granola/",
  ];
  for (const url of urls) {
    const r = await extractRecipeFromUrl(url);
    console.log("\n===", r.title, "===");
    console.log("ings", r.ingredients.length, "steps", r.steps.length);
    console.log(
      "steps preview:",
      r.steps.slice(0, 3).map((s) => s.text.slice(0, 80)),
    );
    console.log("warnings", r.warnings);
  }
}

main();
