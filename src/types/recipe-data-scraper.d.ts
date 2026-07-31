declare module "recipe-data-scraper" {
  export default function recipeDataScraper(url: string): Promise<Record<string, unknown>>;
}
