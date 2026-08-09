import { promises as fs } from "fs";
import path from "path";
import { getDb } from "../src/db/client";
import { saveKitchen, type SharedKitchen } from "../src/db/kitchen-repo";
import { initialCategories, initialRecipes } from "../src/lib/seed";
import type { Category, Recipe } from "../src/lib/types";

const SHARED_JSON = path.join(process.cwd(), "data", "shared-kitchen.json");

function fromSeed(): SharedKitchen {
  return {
    categories: initialCategories,
    recipes: initialRecipes.map((r) => ({ ...r, visibility: "shared" as const })),
    updatedAt: new Date().toISOString(),
  };
}

async function fromSharedJson(): Promise<SharedKitchen | null> {
  try {
    const raw = await fs.readFile(SHARED_JSON, "utf8");
    const parsed = JSON.parse(raw) as {
      categories?: Category[];
      recipes?: Recipe[];
      updatedAt?: string;
    };
    if (!parsed.categories?.length && !parsed.recipes?.length) return null;
    return {
      categories: parsed.categories ?? [],
      recipes: (parsed.recipes ?? []).map((r) => ({
        ...r,
        visibility: r.visibility ?? "shared",
      })),
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function main() {
  // Ensure client/schema side-effects resolve before push-less first run
  getDb();

  const migrated = await fromSharedJson();
  const kitchen = migrated ?? fromSeed();
  const source = migrated ? "data/shared-kitchen.json" : "src/lib/seed.ts";

  const saved = await saveKitchen(kitchen);

  console.log(
    JSON.stringify({
      ok: true,
      source,
      categories: saved.categories.length,
      recipes: saved.recipes.length,
      updatedAt: saved.updatedAt,
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
