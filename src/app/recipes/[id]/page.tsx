"use client";

import { use, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Heart, Clock, Users, Pencil, Trash2 } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { IngredientList } from "@/components/RecipeCard";
import { useKitchenStore } from "@/lib/store";
import { DIET_LABELS, MEAL_LABELS, METHOD_LABELS, cn } from "@/lib/utils";

export default function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const recipes = useKitchenStore((s) => s.recipes);
  const categories = useKitchenStore((s) => s.categories);
  const favorites = useKitchenStore((s) => s.favorites);
  const toggleFavorite = useKitchenStore((s) => s.toggleFavorite);
  const addToPlan = useKitchenStore((s) => s.addToPlan);
  const deleteRecipe = useKitchenStore((s) => s.deleteRecipe);
  const [mounted, setMounted] = useState(false);
  const [added, setAdded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const recipe = recipes.find((r) => r.id === id);
    if (recipe) setImageSrc(recipe.imageUrl);
  }, [recipes, id]);

  const recipe = mounted ? recipes.find((r) => r.id === id) : undefined;
  const category = recipe
    ? categories.find((c) => c.id === recipe.categoryId)
    : undefined;
  const subcategory = recipe?.subcategoryId
    ? categories.find((c) => c.id === recipe.subcategoryId)
    : undefined;

  if (mounted && !recipe) {
    return (
      <AuthGate>
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <p>Рецепт не знайдено.</p>
          <Link href="/recipes" className="mt-4 inline-block text-leaf underline">
            Назад до рецептів
          </Link>
        </div>
      </AuthGate>
    );
  }

  if (!recipe) {
    return (
      <AuthGate>
        <div className="mx-auto max-w-3xl px-4 py-20 text-ink-soft">Завантаження…</div>
      </AuthGate>
    );
  }

  const isFav = favorites.includes(recipe.id);

  return (
    <AuthGate>
      <article className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="relative aspect-[16/9] overflow-hidden rounded-3xl">
          <Image
            src={imageSrc || recipe.imageUrl}
            alt={recipe.title}
            fill
            unoptimized={!(imageSrc || recipe.imageUrl).includes("images.unsplash.com")}
            onError={() =>
              setImageSrc(
                "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=1200&q=80",
              )
            }
            className="object-cover"
            sizes="100vw"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
            <p className="text-sm text-cream/80">
              {[category?.name, subcategory?.name].filter(Boolean).join(" · ")}
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-cream sm:text-5xl">
              {recipe.title}
            </h1>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => toggleFavorite(recipe.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm ring-1 ring-line",
              isFav ? "bg-amber-soft text-leaf-deep" : "bg-surface text-ink-soft",
            )}
          >
            <Heart className={cn("size-4", isFav && "fill-current text-amber")} />
            {isFav ? "У вибраному" : "До вибраного"}
          </button>
          <button
            type="button"
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10);
              addToPlan(today, recipe.mealTypes[0] ?? "dinner", recipe.id, recipe.servings);
              setAdded(true);
            }}
            className="rounded-xl bg-leaf px-4 py-2 text-sm text-cream hover:bg-leaf-deep"
          >
            {added ? "Додано до меню" : "У план меню"}
          </button>
          <Link
            href={`/recipes/${recipe.id}/edit`}
            className="inline-flex items-center gap-2 rounded-xl bg-surface px-4 py-2 text-sm text-ink-soft ring-1 ring-line hover:text-leaf"
          >
            <Pencil className="size-4" />
            Редагувати
          </Link>
          <button
            type="button"
            disabled={deleting}
            onClick={() => {
              if (
                !window.confirm(
                  `Видалити рецепт «${recipe.title}»? Цю дію не можна скасувати.`,
                )
              ) {
                return;
              }
              setDeleting(true);
              void deleteRecipe(recipe.id)
                .then(() => router.push("/recipes"))
                .catch(() => setDeleting(false));
            }}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-amber ring-1 ring-amber/40 hover:bg-amber-soft disabled:opacity-60"
          >
            <Trash2 className="size-4" />
            {deleting ? "Видалення…" : "Видалити"}
          </button>
          <span className="rounded-xl bg-mist px-4 py-2 text-sm text-ink-soft">
            Бачать усі відвідувачі сайту
          </span>
        </div>

        <p className="mt-6 max-w-2xl text-lg text-ink-soft">{recipe.description}</p>

        <div className="mt-4 flex flex-wrap gap-4 text-sm text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-4" /> {recipe.cookTimeMinutes} хв
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-4" /> {recipe.servings} порцій
          </span>
          <span>Автор: {recipe.authorName}</span>
          {recipe.sourceUrl && (
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-leaf hover:underline"
            >
              Джерело <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {recipe.mealTypes.map((m) => (
            <span key={m} className="rounded-md bg-mist px-2 py-1 text-xs">
              {MEAL_LABELS[m]}
            </span>
          ))}
          {recipe.dietTags.map((d) => (
            <span key={d} className="rounded-md bg-amber-soft/70 px-2 py-1 text-xs">
              {DIET_LABELS[d]}
            </span>
          ))}
          {recipe.cookMethods.map((m) => (
            <span key={m} className="rounded-md bg-mist px-2 py-1 text-xs">
              {METHOD_LABELS[m]}
            </span>
          ))}
        </div>

        <div className="mt-10 grid gap-10 md:grid-cols-2">
          <section>
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-leaf-deep">
              Інгредієнти
            </h2>
            <div className="mt-4 rounded-2xl bg-surface/80 p-5 ring-1 ring-line/70">
              <IngredientList ingredients={recipe.ingredients} />
            </div>
          </section>
          <section>
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-leaf-deep">
              Кроки
            </h2>
            <ol className="mt-4 space-y-4">
              {recipe.steps.map((step) => (
                <li key={step.order} className="flex gap-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-leaf text-sm text-cream">
                    {step.order}
                  </span>
                  <p className="pt-1 text-ink-soft">{step.text}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </article>
    </AuthGate>
  );
}
