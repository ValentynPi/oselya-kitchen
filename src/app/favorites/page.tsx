"use client";

import { useMemo } from "react";
import { AuthGate } from "@/components/AuthGate";
import { RecipeCard } from "@/components/RecipeCard";
import { useKitchenStore } from "@/lib/store";

export default function FavoritesPage() {
  const favorites = useKitchenStore((s) => s.favorites);
  const visibleRecipes = useKitchenStore((s) => s.visibleRecipes);

  const list = useMemo(
    () => visibleRecipes().filter((r) => favorites.includes(r.id)),
    [visibleRecipes, favorites],
  );

  return (
    <AuthGate>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-leaf-deep">
          Вибране
        </h1>
        <p className="mt-2 text-ink-soft">
          Ваш персональний список — ці рецепти завжди першими в категоріях.
        </p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} badge="Вибране" />
          ))}
        </div>
        {list.length === 0 && (
          <p className="mt-10 text-ink-soft">Поки порожньо — позначте рецепти сердечком.</p>
        )}
      </div>
    </AuthGate>
  );
}
