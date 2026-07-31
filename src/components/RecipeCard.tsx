"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart, Clock } from "lucide-react";
import type { Recipe } from "@/lib/types";
import { useKitchenStore } from "@/lib/store";
import { cn, formatAmount } from "@/lib/utils";

export function RecipeCard({ recipe, badge }: { recipe: Recipe; badge?: string }) {
  const favorites = useKitchenStore((s) => s.favorites);
  const toggleFavorite = useKitchenStore((s) => s.toggleFavorite);
  const isFav = favorites.includes(recipe.id);

  return (
    <article className="group relative overflow-hidden rounded-2xl bg-surface/70 shadow-[0_1px_0_rgba(20,32,26,0.06)] ring-1 ring-line/70 transition duration-300 hover:-translate-y-0.5 hover:shadow-md">
      <Link href={`/recipes/${recipe.id}`} className="block">
        <div className="relative aspect-[4/3] overflow-hidden">
          <Image
            src={recipe.imageUrl}
            alt={recipe.title}
            fill
            unoptimized={!recipe.imageUrl.includes("images.unsplash.com")}
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
            sizes="(max-width:768px) 100vw, 33vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/55 via-transparent to-transparent" />
          <div className="absolute bottom-3 left-3 right-12">
            <h3 className="font-[family-name:var(--font-display)] text-xl leading-tight text-cream">
              {recipe.title}
            </h3>
          </div>
        </div>
        <div className="space-y-2 p-4">
          <p className="line-clamp-2 text-sm text-ink-soft">{recipe.description}</p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-ink-soft">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              {recipe.cookTimeMinutes} хв
            </span>
            <span>{recipe.authorName}</span>
            {recipe.visibility === "private" && (
              <span className="rounded bg-mist px-1.5 py-0.5">Приватний</span>
            )}
            {badge && (
              <span className="rounded bg-amber-soft px-1.5 py-0.5 text-leaf-deep">{badge}</span>
            )}
          </div>
        </div>
      </Link>
      <button
        type="button"
        aria-label={isFav ? "Прибрати з вибраного" : "Додати до вибраного"}
        onClick={() => toggleFavorite(recipe.id)}
        className={cn(
          "absolute right-3 top-3 rounded-full bg-cream/90 p-2 shadow transition",
          isFav ? "text-amber" : "text-ink-soft hover:text-amber",
        )}
      >
        <Heart className={cn("size-4", isFav && "fill-current")} />
      </button>
    </article>
  );
}

export function IngredientList({
  ingredients,
}: {
  ingredients: Recipe["ingredients"];
}) {
  return (
    <ul className="space-y-2">
      {ingredients.map((ing) => (
        <li
          key={`${ing.name}-${ing.unit}`}
          className="flex items-baseline justify-between gap-4 border-b border-line/60 py-2 text-sm last:border-0"
        >
          <span>{ing.name}</span>
          <span className="shrink-0 text-ink-soft">{formatAmount(ing.amount, ing.unit)}</span>
        </li>
      ))}
    </ul>
  );
}
