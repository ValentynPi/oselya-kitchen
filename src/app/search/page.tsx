"use client";

import { useMemo, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { RecipeCard } from "@/components/RecipeCard";
import { filterRecipes, matchByIngredients, sortWithFavorites } from "@/lib/kitchen";
import { useKitchenStore } from "@/lib/store";

type Mode = "text" | "ingredients";

export default function SearchPage() {
  const visibleRecipes = useKitchenStore((s) => s.visibleRecipes);
  const favorites = useKitchenStore((s) => s.favorites);
  const history = useKitchenStore((s) => s.searchHistory);
  const pushSearchHistory = useKitchenStore((s) => s.pushSearchHistory);
  const clearSearchHistory = useKitchenStore((s) => s.clearSearchHistory);

  const [mode, setMode] = useState<Mode>("ingredients");
  const [query, setQuery] = useState("");
  const [ingredientsText, setIngredientsText] = useState("куряче філе, вершки, печериці");
  const [cookTime, setCookTime] = useState<"all" | "15" | "30" | "60+">("all");
  const [mealType, setMealType] = useState("all");
  const [diet, setDiet] = useState("all");
  const [method, setMethod] = useState("all");
  const [submitted, setSubmitted] = useState(false);

  const textResults = useMemo(() => {
    if (!submitted || mode !== "text") return [];
    return sortWithFavorites(
      filterRecipes(visibleRecipes(), { query, cookTime, mealType, diet, method }),
      new Set(favorites),
    );
  }, [submitted, mode, query, cookTime, mealType, diet, method, visibleRecipes, favorites]);

  const ingredientResults = useMemo(() => {
    if (!submitted || mode !== "ingredients") return [];
    const available = ingredientsText.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    let matches = matchByIngredients(visibleRecipes(), available);
    matches = matches.filter((m) =>
      filterRecipes([m.recipe], { cookTime, mealType, diet, method }).length > 0,
    );
    return matches;
  }, [
    submitted,
    mode,
    ingredientsText,
    cookTime,
    mealType,
    diet,
    method,
    visibleRecipes,
  ]);

  function runSearch() {
    setSubmitted(true);
    if (mode === "text") pushSearchHistory(query, "text");
    else pushSearchHistory(ingredientsText, "ingredients");
  }

  return (
    <AuthGate>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-leaf-deep">
          Пошук
        </h1>
        <p className="mt-2 text-ink-soft">
          Глобальний пошук або режим «Що є в холодильнику?» з точним і частковим збігом.
        </p>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setMode("ingredients");
              setSubmitted(false);
            }}
            className={`rounded-lg px-4 py-2 text-sm ${
              mode === "ingredients" ? "bg-leaf text-cream" : "bg-mist"
            }`}
          >
            Що є в холодильнику?
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("text");
              setSubmitted(false);
            }}
            className={`rounded-lg px-4 py-2 text-sm ${
              mode === "text" ? "bg-leaf text-cream" : "bg-mist"
            }`}
          >
            Глобальний пошук
          </button>
        </div>

        <div className="mt-6 rounded-2xl bg-surface/80 p-5 ring-1 ring-line/70">
          {mode === "ingredients" ? (
            <label className="block" htmlFor="search-ingredients">
              <span className="text-sm text-ink-soft">Продукти через кому</span>
              <textarea
                id="search-ingredients"
                name="search-ingredients"
                value={ingredientsText}
                onChange={(e) => setIngredientsText(e.target.value)}
                rows={3}
                className="mt-2 w-full rounded-xl border border-line bg-cream/50 px-3 py-2 outline-none focus:border-leaf"
              />
            </label>
          ) : (
            <label className="block" htmlFor="search-query">
              <span className="text-sm text-ink-soft">Назва, інструкція, автор, джерело</span>
              <input
                id="search-query"
                name="search-query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="mt-2 w-full rounded-xl border border-line bg-cream/50 px-3 py-2 outline-none focus:border-leaf"
                placeholder="Наприклад: борщ"
              />
            </label>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect
              id="search-cook-time"
              label="Час"
              value={cookTime}
              onChange={(v) => setCookTime(v as typeof cookTime)}
              options={[
                ["all", "Будь-який"],
                ["15", "До 15 хв"],
                ["30", "До 30 хв"],
                ["60+", "Понад 1 год"],
              ]}
            />
            <FilterSelect
              id="search-meal-type"
              label="Прийом їжі"
              value={mealType}
              onChange={setMealType}
              options={[
                ["all", "Усі"],
                ["breakfast", "Сніданок"],
                ["lunch", "Обід"],
                ["dinner", "Вечеря"],
                ["snack", "Перекус"],
              ]}
            />
            <FilterSelect
              id="search-diet"
              label="Харчування"
              value={diet}
              onChange={setDiet}
              options={[
                ["all", "Усі"],
                ["vegetarian", "Вегетаріанське"],
                ["vegan", "Веганське"],
                ["gluten-free", "Безглютенове"],
                ["dairy-free", "Безмолочне"],
              ]}
            />
            <FilterSelect
              id="search-method"
              label="Спосіб"
              value={method}
              onChange={setMethod}
              options={[
                ["all", "Усі"],
                ["oven", "Духовка"],
                ["stovetop", "Плита"],
                ["multicooker", "Мультиварка"],
                ["grill", "Гриль"],
                ["no-cook", "Без термічної"],
              ]}
            />
          </div>

          <button
            type="button"
            onClick={runSearch}
            className="mt-4 rounded-xl bg-leaf px-5 py-2.5 text-sm text-cream hover:bg-leaf-deep"
          >
            Шукати
          </button>
        </div>

        {history.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-soft">Історія:</span>
            {history.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  setMode(h.kind);
                  if (h.kind === "text") setQuery(h.query);
                  else setIngredientsText(h.query);
                  setSubmitted(true);
                }}
                className="rounded-full bg-mist px-3 py-1 text-xs text-ink-soft hover:bg-line"
              >
                {h.query}
              </button>
            ))}
            <button
              type="button"
              onClick={clearSearchHistory}
              className="text-xs text-leaf underline"
            >
              Очистити
            </button>
          </div>
        )}

        <div className="mt-10 space-y-6">
          {mode === "text" &&
            textResults.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                badge={favorites.includes(recipe.id) ? "Вибране" : undefined}
              />
            ))}

          {mode === "ingredients" &&
            ingredientResults.map((match) => (
              <div key={match.recipe.id} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs ${
                      match.kind === "exact"
                        ? "bg-leaf text-cream"
                        : "bg-amber-soft text-leaf-deep"
                    }`}
                  >
                    {match.kind === "exact" ? "Точний збіг" : "Частковий збіг"}
                  </span>
                  <span className="text-ink-soft">
                    {Math.round(match.coverage * 100)}% інгредієнтів
                  </span>
                  {match.missing.length > 0 && (
                    <span className="text-ink-soft">
                      Бракує: {match.missing.slice(0, 4).join(", ")}
                      {match.missing.length > 4 ? "…" : ""}
                    </span>
                  )}
                </div>
                <RecipeCard recipe={match.recipe} />
              </div>
            ))}

          {submitted &&
            ((mode === "text" && textResults.length === 0) ||
              (mode === "ingredients" && ingredientResults.length === 0)) && (
              <p className="text-ink-soft">Нічого не знайдено. Спробуйте інші фільтри.</p>
            )}
        </div>
      </div>
    </AuthGate>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block text-sm" htmlFor={id}>
      <span className="text-ink-soft">{label}</span>
      <select
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-line bg-cream/50 px-3 py-2"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
