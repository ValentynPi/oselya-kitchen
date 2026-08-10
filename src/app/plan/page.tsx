"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { addDays, format, startOfWeek } from "date-fns";
import { uk } from "date-fns/locale";
import { AuthGate } from "@/components/AuthGate";
import { useKitchenStore } from "@/lib/store";
import type { MealType } from "@/lib/types";
import { MEAL_LABELS } from "@/lib/utils";
import { formatIngredientDisplay } from "@/lib/ingredients";
import { scaleIngredients } from "@/lib/kitchen";

const MEALS: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export default function PlanPage() {
  const mealPlan = useKitchenStore((s) => s.mealPlan);
  const recipes = useKitchenStore((s) => s.recipes);
  const visibleRecipes = useKitchenStore((s) => s.visibleRecipes);
  const addToPlan = useKitchenStore((s) => s.addToPlan);
  const removeFromPlan = useKitchenStore((s) => s.removeFromPlan);
  const generateShoppingList = useKitchenStore((s) => s.generateShoppingList);

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const [date, setDate] = useState(format(days[0], "yyyy-MM-dd"));
  const [mealType, setMealType] = useState<MealType>("dinner");
  const [recipeId, setRecipeId] = useState("");
  const [servings, setServings] = useState(4);

  const available = visibleRecipes();

  const preview = useMemo(() => {
    const recipe = recipes.find((r) => r.id === recipeId);
    if (!recipe) return null;
    return scaleIngredients(recipe.ingredients, recipe.servings, servings);
  }, [recipeId, servings, recipes]);

  return (
    <AuthGate>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-4xl text-leaf-deep">
              План меню
            </h1>
            <p className="mt-2 text-ink-soft">
              Спільний календар харчування на тиждень з перерахунком порцій.
            </p>
          </div>
          <Link
            href="/shopping"
            onClick={() => generateShoppingList()}
            className="rounded-xl bg-amber px-4 py-2.5 text-sm font-medium text-ink hover:bg-amber-soft"
          >
            Згенерувати покупки
          </Link>
        </div>

        <div className="mt-8 overflow-x-auto">
          <div className="min-w-[720px] grid grid-cols-8 gap-2">
            <div />
            {days.map((d) => (
              <div
                key={d.toISOString()}
                className="rounded-lg bg-mist/80 px-2 py-2 text-center text-xs"
              >
                <div className="font-medium capitalize">
                  {format(d, "EEEEEE", { locale: uk })}
                </div>
                <div className="text-ink-soft">{format(d, "d MMM", { locale: uk })}</div>
              </div>
            ))}

            {MEALS.map((meal) => (
              <div key={meal} className="contents">
                <div className="flex items-center text-xs font-medium text-ink-soft">
                  {MEAL_LABELS[meal]}
                </div>
                {days.map((d) => {
                  const key = format(d, "yyyy-MM-dd");
                  const entries = mealPlan.filter(
                    (e) => e.date === key && e.mealType === meal,
                  );
                  return (
                    <div
                      key={`${meal}-${key}`}
                      className="min-h-20 rounded-xl bg-surface/70 p-2 ring-1 ring-line/60"
                    >
                      {entries.map((entry) => {
                        const recipe = recipes.find((r) => r.id === entry.recipeId);
                        return (
                          <div key={entry.id} className="mb-1 rounded-lg bg-mist p-1.5 text-[11px]">
                            <p className="font-medium leading-tight">{recipe?.title ?? "—"}</p>
                            <p className="text-ink-soft">{entry.servings} порц.</p>
                            <button
                              type="button"
                              onClick={() => removeFromPlan(entry.id)}
                              className="mt-1 text-leaf underline"
                            >
                              Прибрати
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <section className="mt-10 rounded-2xl bg-surface/80 p-5 ring-1 ring-line/70">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-leaf-deep">
            Додати до плану
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm" htmlFor="plan-date">
              <span className="text-ink-soft">Дата</span>
              <select
                id="plan-date"
                name="plan-date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-line bg-cream/50 px-3 py-2"
              >
                {days.map((d) => (
                  <option key={d.toISOString()} value={format(d, "yyyy-MM-dd")}>
                    {format(d, "EEEE, d MMMM", { locale: uk })}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm" htmlFor="plan-meal-type">
              <span className="text-ink-soft">Прийом їжі</span>
              <select
                id="plan-meal-type"
                name="plan-meal-type"
                value={mealType}
                onChange={(e) => setMealType(e.target.value as MealType)}
                className="mt-1 w-full rounded-xl border border-line bg-cream/50 px-3 py-2"
              >
                {MEALS.map((m) => (
                  <option key={m} value={m}>
                    {MEAL_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm" htmlFor="plan-recipe">
              <span className="text-ink-soft">Рецепт</span>
              <select
                id="plan-recipe"
                name="plan-recipe"
                value={recipeId}
                onChange={(e) => {
                  setRecipeId(e.target.value);
                  const r = available.find((x) => x.id === e.target.value);
                  if (r) setServings(r.servings);
                }}
                className="mt-1 w-full rounded-xl border border-line bg-cream/50 px-3 py-2"
              >
                <option value="">Оберіть…</option>
                {available.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm" htmlFor="plan-servings">
              <span className="text-ink-soft">Порції</span>
              <input
                id="plan-servings"
                name="plan-servings"
                type="number"
                min={1}
                value={servings}
                onChange={(e) => setServings(Number(e.target.value) || 1)}
                className="mt-1 w-full rounded-xl border border-line bg-cream/50 px-3 py-2"
              />
            </label>
          </div>

          {preview && (
            <div className="mt-4 rounded-xl bg-mist/60 p-3 text-sm">
              <p className="font-medium text-leaf-deep">Перерахунок інгредієнтів</p>
              <ul className="mt-2 columns-2 gap-4 text-ink-soft">
                {preview.map((ing, idx) => (
                  <li key={`${ing.name}-${idx}`}>
                    {formatIngredientDisplay(ing)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            disabled={!recipeId}
            onClick={() => {
              addToPlan(date, mealType, recipeId, servings);
              setRecipeId("");
            }}
            className="mt-4 rounded-xl bg-leaf px-5 py-2.5 text-sm text-cream hover:bg-leaf-deep disabled:opacity-40"
          >
            Додати
          </button>
        </section>
      </div>
    </AuthGate>
  );
}
