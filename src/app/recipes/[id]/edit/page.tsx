"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { suggestCategoryName } from "@/lib/ai";
import { formatIngredientDisplay, smartParseIngredient } from "@/lib/ingredients";
import { useKitchenStore } from "@/lib/store";
import type { Ingredient, MealType, RecipeStep } from "@/lib/types";
import { MEAL_LABELS, cn } from "@/lib/utils";

export default function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const recipes = useKitchenStore((s) => s.recipes);
  const updateRecipe = useKitchenStore((s) => s.updateRecipe);
  const deleteRecipe = useKitchenStore((s) => s.deleteRecipe);
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [cookTimeMinutes, setCookTimeMinutes] = useState(30);
  const [servings, setServings] = useState(4);
  const [mealTypes, setMealTypes] = useState<MealType[]>(["dinner"]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [steps, setSteps] = useState<RecipeStep[]>([]);

  useEffect(() => setMounted(true), []);

  const recipe = mounted ? recipes.find((r) => r.id === id) : undefined;

  const predictedCategory = useMemo(
    () =>
      title.trim()
        ? suggestCategoryName({
            title,
            description,
            ingredients: ingredients.filter((i) => i.name.trim()),
            mealTypes,
            cookTimeMinutes,
            steps: steps.filter((s) => s.text.trim()),
          })
        : null,
    [title, description, ingredients, mealTypes, cookTimeMinutes, steps],
  );

  useEffect(() => {
    if (!recipe) return;
    setTitle(recipe.title);
    setDescription(recipe.description);
    setSourceUrl(recipe.sourceUrl ?? "");
    setImageUrl(recipe.imageUrl);
    setCookTimeMinutes(recipe.cookTimeMinutes);
    setServings(recipe.servings);
    setMealTypes(recipe.mealTypes.length ? recipe.mealTypes : ["dinner"]);
    setIngredients(
      recipe.ingredients.length
        ? recipe.ingredients
        : [{ name: "", amount: 1, unit: "г", aisle: "produce" }],
    );
    setSteps(recipe.steps.length ? recipe.steps : [{ order: 1, text: "" }]);
  }, [recipe]);

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

  async function save() {
    if (!title.trim()) {
      setError("Вкажіть назву страви");
      return;
    }
    const nextIngredients = ingredients.filter((i) => i.name.trim());
    const nextSteps = steps
      .filter((s) => s.text.trim())
      .map((s, i) => ({ ...s, order: i + 1 }));

    if (nextIngredients.length === 0) {
      setError("Додайте хоча б один інгредієнт");
      return;
    }
    if (nextSteps.length === 0) {
      setError("Додайте хоча б один крок");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const nextMeals: MealType[] = mealTypes.length ? mealTypes : ["dinner"];
      const categoryName = suggestCategoryName({
        title: title.trim(),
        description: description.trim(),
        ingredients: nextIngredients,
        mealTypes: nextMeals,
        cookTimeMinutes,
        steps: nextSteps,
      });
      await updateRecipe(id, {
        title: title.trim(),
        description: description.trim() || "Сімейний рецепт",
        sourceUrl: sourceUrl.trim() || undefined,
        imageUrl,
        cookTimeMinutes,
        servings,
        mealTypes: nextMeals,
        ingredients: nextIngredients,
        steps: nextSteps,
        categoryName,
      });
      router.push(`/recipes/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося зберегти");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Видалити рецепт «${title}»? Цю дію не можна скасувати.`)) {
      return;
    }
    setSaving(true);
    try {
      await deleteRecipe(id);
      router.push("/recipes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося видалити");
      setSaving(false);
    }
  }

  return (
    <AuthGate>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Link
          href={`/recipes/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-leaf"
        >
          <ArrowLeft className="size-4" /> До рецепта
        </Link>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl text-leaf-deep">
          Редагувати рецепт
        </h1>
        <p className="mt-2 text-ink-soft">Змініть будь-які поля й збережіть — або видаліть картку.</p>

        {predictedCategory && (
          <div className="mt-4 rounded-xl bg-mist/80 px-4 py-3 text-sm text-ink-soft">
            Група обирається автоматично:{" "}
            <span className="font-medium text-leaf">{predictedCategory}</span>
          </div>
        )}

        <div className="mt-8 space-y-6">
          <label className="block">
            <span className="mb-1.5 block text-sm text-ink-soft">Назва</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-line bg-cream/60 px-4 py-3 outline-none focus:border-leaf"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm text-ink-soft">Опис</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-line bg-cream/60 px-4 py-3 outline-none focus:border-leaf"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm text-ink-soft">Час (хв)</span>
              <input
                type="number"
                min={1}
                value={cookTimeMinutes}
                onChange={(e) => setCookTimeMinutes(Number(e.target.value) || 1)}
                className="w-full rounded-xl border border-line bg-cream/60 px-4 py-3 outline-none focus:border-leaf"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm text-ink-soft">Порції</span>
              <input
                type="number"
                min={1}
                value={servings}
                onChange={(e) => setServings(Number(e.target.value) || 1)}
                className="w-full rounded-xl border border-line bg-cream/60 px-4 py-3 outline-none focus:border-leaf"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm text-ink-soft">Посилання на фото</span>
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="w-full rounded-xl border border-line bg-cream/60 px-4 py-3 outline-none focus:border-leaf"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm text-ink-soft">Джерело (URL)</span>
            <input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className="w-full rounded-xl border border-line bg-cream/60 px-4 py-3 outline-none focus:border-leaf"
            />
          </label>

          <div>
            <span className="mb-2 block text-sm text-ink-soft">Прийом їжі</span>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(MEAL_LABELS) as MealType[]).map((m) => {
                const on = mealTypes.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() =>
                      setMealTypes((prev) =>
                        on ? prev.filter((x) => x !== m) : [...prev, m],
                      )
                    }
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm ring-1 ring-line",
                      on ? "bg-leaf text-cream" : "bg-surface text-ink-soft",
                    )}
                  >
                    {MEAL_LABELS[m]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-display)] text-xl text-leaf-deep">
                Інгредієнти
              </h2>
              <button
                type="button"
                onClick={() =>
                  setIngredients((prev) => [
                    ...prev,
                    { name: "", amount: 1, unit: "г", aisle: "produce" },
                  ])
                }
                className="inline-flex items-center gap-1 text-sm text-leaf"
              >
                <Plus className="size-4" /> Рядок
              </button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[72px_72px_1fr_36px] gap-2 px-1 text-[11px] uppercase tracking-wide text-ink-soft">
                <span>К-сть</span>
                <span>Од.</span>
                <span>Назва</span>
                <span />
              </div>
              {ingredients.map((ing, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="grid grid-cols-[72px_72px_1fr_36px] gap-2">
                    <input
                      type="number"
                      step="any"
                      value={ing.amount}
                      onChange={(e) => {
                        const next = [...ingredients];
                        next[idx] = { ...ing, amount: Number(e.target.value) || 0 };
                        setIngredients(next);
                      }}
                      className="w-full rounded-xl border border-line bg-cream/60 px-3 py-2 outline-none focus:border-leaf"
                    />
                    <input
                      value={ing.unit}
                      onChange={(e) => {
                        const next = [...ingredients];
                        next[idx] = { ...ing, unit: e.target.value };
                        setIngredients(next);
                      }}
                      className="w-full rounded-xl border border-line bg-cream/60 px-3 py-2 outline-none focus:border-leaf"
                    />
                    <input
                      value={ing.name}
                      onChange={(e) => {
                        const next = [...ingredients];
                        next[idx] = { ...ing, name: e.target.value };
                        setIngredients(next);
                      }}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        if (
                          !raw ||
                          !(
                            /^[\d¼½¾⅓⅔]/.test(raw) ||
                            /\d+\s*(?:g|kg|ml|l|г|кг|мл|л|ст\.?\s*л|ч\.?\s*л)\b/i.test(raw)
                          )
                        ) {
                          return;
                        }
                        const next = [...ingredients];
                        next[idx] = smartParseIngredient(raw);
                        setIngredients(next);
                      }}
                      className="w-full rounded-xl border border-line bg-cream/60 px-3 py-2 outline-none focus:border-leaf"
                    />
                    <button
                      type="button"
                      aria-label="Видалити"
                      onClick={() =>
                        setIngredients(ingredients.filter((_, i) => i !== idx))
                      }
                      className="flex items-center justify-center text-ink-soft hover:text-amber"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  {ing.name && (
                    <p className="px-1 text-xs text-ink-soft">{formatIngredientDisplay(ing)}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-display)] text-xl text-leaf-deep">
                Кроки
              </h2>
              <button
                type="button"
                onClick={() =>
                  setSteps((prev) => [...prev, { order: prev.length + 1, text: "" }])
                }
                className="inline-flex items-center gap-1 text-sm text-leaf"
              >
                <Plus className="size-4" /> Крок
              </button>
            </div>
            <div className="space-y-2">
              {steps.map((step, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="mt-3 flex size-8 shrink-0 items-center justify-center rounded-full bg-leaf text-sm text-cream">
                    {idx + 1}
                  </span>
                  <textarea
                    value={step.text}
                    onChange={(e) => {
                      const next = [...steps];
                      next[idx] = { ...step, text: e.target.value };
                      setSteps(next);
                    }}
                    rows={2}
                    className="w-full rounded-xl border border-line bg-cream/60 px-3 py-2 outline-none focus:border-leaf"
                  />
                  <button
                    type="button"
                    aria-label="Видалити крок"
                    onClick={() => setSteps(steps.filter((_, i) => i !== idx))}
                    className="mt-2 text-ink-soft hover:text-amber"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-xl bg-amber-soft/80 px-4 py-3 text-sm text-leaf-deep">{error}</p>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="inline-flex items-center gap-2 rounded-xl bg-leaf px-5 py-3 text-sm text-cream hover:bg-leaf-deep disabled:opacity-60"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              Зберегти зміни
            </button>
            <Link
              href={`/recipes/${id}`}
              className="rounded-xl bg-mist px-5 py-3 text-sm text-ink-soft hover:text-ink"
            >
              Скасувати
            </Link>
            <button
              type="button"
              disabled={saving}
              onClick={() => void remove()}
              className="ml-auto inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm text-amber ring-1 ring-amber/40 hover:bg-amber-soft disabled:opacity-60"
            >
              <Trash2 className="size-4" />
              Видалити рецепт
            </button>
          </div>
        </div>
      </div>
    </AuthGate>
  );
}
