"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useKitchenStore } from "@/lib/store";
import { sortWithFavorites } from "@/lib/kitchen";
import { RecipeCard } from "@/components/RecipeCard";
import { AuthGate } from "@/components/AuthGate";

export default function RecipesPage() {
  const categories = useKitchenStore((s) => s.categories);
  const favorites = useKitchenStore((s) => s.favorites);
  const visibleRecipes = useKitchenStore((s) => s.visibleRecipes);
  const [categoryId, setCategoryId] = useState<string>("all");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const parents = categories.filter((c) => !c.parentId);
  const subs = categories.filter((c) => c.parentId === categoryId);

  const recipes = useMemo(() => {
    if (!mounted) return [];
    let list = visibleRecipes();
    if (categoryId !== "all") {
      const isParent = parents.some((p) => p.id === categoryId);
      list = list.filter((r) =>
        isParent
          ? r.categoryId === categoryId || r.subcategoryId === categoryId
          : r.subcategoryId === categoryId || r.categoryId === categoryId,
      );
    }
    return sortWithFavorites(list, new Set(favorites));
  }, [mounted, categoryId, favorites, visibleRecipes, parents]);

  return (
    <AuthGate>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-4xl text-leaf-deep">
              Рецепти родини
            </h1>
            <p className="mt-2 text-ink-soft">
              Спільна бібліотека з пріоритетом вашого вибраного.
            </p>
          </div>
          <Link
            href="/add"
            className="rounded-xl bg-leaf px-4 py-2.5 text-sm text-cream hover:bg-leaf-deep"
          >
            Додати рецепт
          </Link>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategoryId("all")}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              categoryId === "all" ? "bg-leaf text-cream" : "bg-mist text-ink-soft"
            }`}
          >
            Усі
          </button>
          {parents.map((c) => {
            const count = mounted
              ? visibleRecipes().filter((r) => r.categoryId === c.id).length
              : 0;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  categoryId === c.id ? "bg-leaf text-cream" : "bg-mist text-ink-soft"
                }`}
              >
                {c.name}
                <span className="ml-1 opacity-70">({count})</span>
              </button>
            );
          })}
        </div>

        {subs.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {subs.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setCategoryId(s.id)}
                className={`rounded-lg border px-3 py-1 text-xs ${
                  categoryId === s.id
                    ? "border-leaf bg-leaf/10 text-leaf-deep"
                    : "border-line text-ink-soft"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              badge={favorites.includes(recipe.id) ? "Вибране" : undefined}
            />
          ))}
        </div>
      </div>
    </AuthGate>
  );
}
