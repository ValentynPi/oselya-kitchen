"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useKitchenStore } from "@/lib/store";
import { sortWithFavorites } from "@/lib/kitchen";
import { RecipeCard } from "@/components/RecipeCard";
import { AuthGate } from "@/components/AuthGate";

export default function RecipesPage() {
  const categories = useKitchenStore((s) => s.categories);
  const favorites = useKitchenStore((s) => s.favorites);
  const visibleRecipes = useKitchenStore((s) => s.visibleRecipes);
  const addCategory = useKitchenStore((s) => s.addCategory);
  const [categoryId, setCategoryId] = useState<string>("all");
  const [mounted, setMounted] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  async function createCategory() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setError("");
    try {
      const created = await addCategory(name);
      setCategoryId(created.id);
      setNewName("");
      setShowNew(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося створити");
    } finally {
      setSaving(false);
    }
  }

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
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg bg-mist px-3 py-1.5 text-sm text-leaf ring-1 ring-line hover:ring-leaf"
          >
            <Plus className="size-3.5" />
            Категорія
          </button>
        </div>

        {showNew && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              id="category-name"
              name="category-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void createCategory();
                }
              }}
              placeholder="Нова категорія, напр. Гриль"
              maxLength={40}
              className="min-w-[14rem] flex-1 rounded-lg border border-line bg-cream/60 px-3 py-2 text-sm outline-none focus:border-leaf sm:max-w-xs"
            />
            <button
              type="button"
              disabled={saving || !newName.trim()}
              onClick={() => void createCategory()}
              className="rounded-lg bg-leaf px-3 py-2 text-sm text-cream disabled:opacity-40"
            >
              {saving ? "…" : "Створити"}
            </button>
            {error && <p className="w-full text-sm text-amber">{error}</p>}
          </div>
        )}

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
