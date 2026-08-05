"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardPaste, Link2, Loader2, PenLine, Plus, Trash2, Sparkles } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { CategoryPicker } from "@/components/CategoryPicker";
import { suggestCategoryName } from "@/lib/ai";
import { smartParseIngredient } from "@/lib/ingredients";
import { useKitchenStore } from "@/lib/store";
import type { Ingredient, MealType, RecipeStep, Visibility } from "@/lib/types";
import { MEAL_LABELS, cn } from "@/lib/utils";
import { Suspense } from "react";

type Tab = "url" | "text" | "manual";

interface Draft {
  title: string;
  description: string;
  sourceUrl: string;
  imageUrl: string;
  cookTimeMinutes: number;
  servings: number;
  visibility: Visibility;
  mealTypes: MealType[];
  ingredients: Ingredient[];
  steps: RecipeStep[];
  warnings: string[];
  /** null = auto-pick from content */
  categoryName: string | null;
  drinkSubgroup: string | null;
}

const emptyDraft = (): Draft => ({
  title: "",
  description: "",
  sourceUrl: "",
  imageUrl:
    "https://images.unsplash.com/photo-1466637574441-749b8f19452f?auto=format&fit=crop&w=1200&q=80",
  cookTimeMinutes: 30,
  servings: 4,
  visibility: "shared",
  mealTypes: ["dinner"],
  ingredients: [{ name: "", amount: 1, unit: "г", aisle: "produce" }],
  steps: [{ order: 1, text: "" }],
  warnings: [],
  categoryName: null,
  drinkSubgroup: null,
});

function AddRecipeInner() {
  const addRecipe = useKitchenStore((s) => s.addRecipe);
  const categories = useKitchenStore((s) => s.categories);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>("url");
  const [url, setUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  const predictedCategory = useMemo(() => {
    if (!draft?.title) return null;
    return suggestCategoryName({
      title: draft.title,
      description: draft.description,
      ingredients: draft.ingredients.filter((i) => i.name.trim()),
      mealTypes: draft.mealTypes,
      cookTimeMinutes: draft.cookTimeMinutes,
      steps: draft.steps.filter((s) => s.text.trim()),
    });
  }, [draft]);

  function applyExtracted(r: {
    title: string;
    description: string;
    sourceUrl: string;
    imageUrl?: string;
    cookTimeMinutes: number;
    servings: number;
    ingredients: Ingredient[];
    steps: RecipeStep[];
    warnings: string[];
    categoryName?: string;
    subcategoryName?: string;
    mealTypes?: MealType[];
    aiUsed?: boolean;
  }) {
    const aiCategory = r.categoryName?.trim() || null;

    setDraft({
      title: r.title,
      description: r.description,
      sourceUrl: r.sourceUrl,
      imageUrl:
        r.imageUrl ||
        "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=1200&q=80",
      cookTimeMinutes: r.cookTimeMinutes,
      servings: r.servings,
      visibility: "shared",
      mealTypes:
        r.mealTypes && r.mealTypes.length > 0 ? r.mealTypes : ["dinner"],
      ingredients: r.ingredients.length
        ? r.ingredients
        : [{ name: "", amount: 1, unit: "г", aisle: "produce" }],
      steps: r.steps.length ? r.steps : [{ order: 1, text: "" }],
      warnings: r.warnings || [],
      categoryName: aiCategory,
      drinkSubgroup:
        aiCategory === "Напої" ? r.subcategoryName?.trim() || null : null,
    });
  }

  async function extractFromUrl(link: string) {
    setError("");
    const trimmed = link.trim();
    if (!trimmed) {
      setError("Вставте посилання на рецепт");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await res.json()) as {
        recipe?: {
          title: string;
          description: string;
          sourceUrl: string;
          imageUrl?: string;
          cookTimeMinutes: number;
          servings: number;
          ingredients: Ingredient[];
          steps: RecipeStep[];
          warnings: string[];
          categoryName?: string;
          subcategoryName?: string;
          mealTypes?: MealType[];
          aiUsed?: boolean;
        };
        error?: string;
      };

      if (!res.ok || !data.recipe) {
        setError(data.error || "Не вдалося витягти рецепт");
        return;
      }

      applyExtracted(data.recipe);
      setTab("url");
    } catch {
      setError("Мережева помилка під час імпорту");
    } finally {
      setLoading(false);
    }
  }

  async function extractFromText() {
    setError("");
    const trimmed = pastedText.trim();
    if (!trimmed) {
      setError("Вставте текст рецепта");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/parse-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      const data = (await res.json()) as {
        recipe?: {
          title: string;
          description: string;
          sourceUrl: string;
          imageUrl?: string;
          cookTimeMinutes: number;
          servings: number;
          ingredients: Ingredient[];
          steps: RecipeStep[];
          warnings: string[];
          categoryName?: string;
          subcategoryName?: string;
          mealTypes?: MealType[];
          aiUsed?: boolean;
        };
        error?: string;
      };

      if (!res.ok || !data.recipe) {
        setError(data.error || "Не вдалося розібрати текст");
        return;
      }

      applyExtracted(data.recipe);
      setTab("text");
    } catch {
      setError("Мережева помилка під час розбору тексту");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (bootstrapped) return;
    setBootstrapped(true);
    const mode = searchParams.get("mode");
    const presetUrl = searchParams.get("url");
    if (mode === "manual") {
      setTab("manual");
      setDraft(emptyDraft());
      return;
    }
    if (mode === "text") {
      setTab("text");
      return;
    }
    if (presetUrl) {
      setUrl(presetUrl);
      void extractFromUrl(presetUrl);
    }
  }, [bootstrapped, searchParams]);

  function startManual() {
    setTab("manual");
    setDraft(emptyDraft());
    setError("");
  }

  async function save() {
    if (!draft) return;
    if (!draft.title.trim()) {
      setError("Вкажіть назву страви");
      return;
    }
    const ingredients = draft.ingredients.filter((i) => i.name.trim());
    const steps = draft.steps
      .filter((s) => s.text.trim())
      .map((s, i) => ({ ...s, order: i + 1 }));

    if (ingredients.length === 0) {
      setError("Додайте хоча б один інгредієнт");
      return;
    }
    if (steps.length === 0) {
      setError("Додайте хоча б один крок");
      return;
    }

    try {
      setError("");
      const mealTypes: MealType[] = draft.mealTypes.length ? draft.mealTypes : ["dinner"];
      const categoryName =
        draft.categoryName ??
        suggestCategoryName({
          title: draft.title.trim(),
          description: draft.description.trim(),
          ingredients,
          mealTypes,
          cookTimeMinutes: draft.cookTimeMinutes,
          steps,
        });
      const recipe = await addRecipe({
        title: draft.title.trim(),
        description: draft.description.trim() || "Сімейний рецепт",
        sourceUrl: draft.sourceUrl.trim() || undefined,
        ingredients,
        steps,
        imageUrl: draft.imageUrl,
        cookTimeMinutes: draft.cookTimeMinutes,
        mealTypes,
        dietTags: [],
        cookMethods: ["stovetop"],
        servings: draft.servings,
        categoryName,
        subcategoryName:
          categoryName === "Напої" ? draft.drinkSubgroup ?? undefined : undefined,
      });
      router.push(`/recipes/${recipe.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося зберегти рецепт");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-leaf">Головне</p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-leaf-deep sm:text-5xl">
        Додати рецепт
      </h1>
      <p className="mt-3 max-w-xl text-ink-soft">
        Вставте посилання, скопійований текст рецепта — або створіть картку з нуля. Усе потрапляє
        в спільну книгу для всіх відвідувачів.
      </p>

      <div className="mt-8 flex flex-col gap-2 rounded-xl bg-mist/80 p-1 sm:flex-row">
        <button
          type="button"
          onClick={() => {
            setTab("url");
            setDraft(null);
            setError("");
          }}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm transition",
            tab === "url" ? "bg-leaf text-cream shadow-sm" : "text-ink-soft hover:text-ink",
          )}
        >
          <Link2 className="size-4" />
          З посилання
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("text");
            setDraft(null);
            setError("");
          }}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm transition",
            tab === "text" ? "bg-leaf text-cream shadow-sm" : "text-ink-soft hover:text-ink",
          )}
        >
          <ClipboardPaste className="size-4" />
          З тексту
        </button>
        <button
          type="button"
          onClick={startManual}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm transition",
            tab === "manual" ? "bg-leaf text-cream shadow-sm" : "text-ink-soft hover:text-ink",
          )}
        >
          <PenLine className="size-4" />
          Своїми руками
        </button>
      </div>

      {tab === "url" && !draft && (
        <section className="mt-6 rounded-2xl bg-surface/85 p-5 ring-1 ring-line/70 sm:p-7">
          <label className="block">
            <span className="text-sm text-ink-soft">
              URL сайту з рецептом, Instagram Reels / допис або Facebook
            </span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void extractFromUrl(url);
              }}
              placeholder="https://..."
              className="mt-2 w-full rounded-xl border border-line bg-cream/60 px-4 py-3 text-base outline-none focus:border-leaf"
              autoFocus
            />
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={() => void extractFromUrl(url)}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber px-5 py-3 text-sm font-medium text-ink transition hover:bg-amber-soft disabled:opacity-60 sm:w-auto"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Читаю сторінку…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Витягти рецепт
              </>
            )}
          </button>
          <p className="mt-3 text-xs text-ink-soft">
            Сайти на кшталт BBC Good Food, Cookie and Kate тощо читаються через
            структуровані дані рецепта. Якщо сайт блокує ботів — скопіюйте текст у «З тексту».
          </p>
        </section>
      )}

      {tab === "text" && !draft && (
        <section className="mt-6 rounded-2xl bg-surface/85 p-5 ring-1 ring-line/70 sm:p-7">
          <label className="block">
            <span className="text-sm text-ink-soft">
              Вставте рецепт з чату, нотаток, Instagram чи будь-якого тексту
            </span>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              rows={12}
              placeholder={`Борщ український\n\nІнгредієнти:\nБуряк — 300 г\nКапуста — 250 г\n...\n\nПриготування:\n1. Зваріть бульйон.\n2. Додайте овочі.`}
              className="mt-2 w-full rounded-xl border border-line bg-cream/60 px-4 py-3 text-sm outline-none focus:border-leaf"
              autoFocus
            />
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={() => void extractFromText()}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber px-5 py-3 text-sm font-medium text-ink transition hover:bg-amber-soft disabled:opacity-60 sm:w-auto"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Розбираю і перекладаю…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Зробити рецепт з тексту
              </>
            )}
          </button>
          <p className="mt-3 text-xs text-ink-soft">
            Краще працює з блоками «Ingredients / Інгредієнти» та «Instructions / Приготування».
            Якщо текст іншою мовою — автоматично перекладемо українською.
          </p>
        </section>
      )}

      {loading && !draft && (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-soft">
          <Loader2 className="size-4 animate-spin" /> Читаю рецепт і перевіряю ШІ…
        </p>
      )}

      {draft && (
        <section className="mt-6 space-y-5">
          {draft.warnings.some((w) => /ШІ|Gemini|евристик/i.test(w)) && (
            <p className="text-xs text-ink-soft">
              {draft.warnings.some((w) => /Оброблено ШІ/i.test(w))
                ? "ШІ переглянув картку: інгредієнти, кроки й категорію можна ще підправити вручну."
                : "ШІ на сервері не активний або тимчасово недоступний — спрацювала запасна логіка."}
            </p>
          )}

          {draft.warnings.length > 0 && (
            <div className="rounded-xl border border-amber/40 bg-amber-soft/50 px-4 py-3 text-sm text-leaf-deep">
              {draft.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          )}

          <CategoryPicker
            value={draft.categoryName}
            predicted={predictedCategory}
            extraGroups={categories.filter((c) => !c.parentId).map((c) => c.name)}
            drinkSubgroup={draft.drinkSubgroup}
            onChange={(categoryName, drinkSubgroup) =>
              setDraft({ ...draft, categoryName, drinkSubgroup })
            }
          />

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={draft.imageUrl}
            alt={draft.title || "Рецепт"}
            className="aspect-[16/9] w-full rounded-2xl object-cover ring-1 ring-line/70"
          />

          <Field label="Назва страви">
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="w-full rounded-xl border border-line bg-cream/60 px-3 py-2.5 outline-none focus:border-leaf"
            />
          </Field>

          <Field label="Короткий опис">
            <textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={3}
              className="w-full rounded-xl border border-line bg-cream/60 px-3 py-2.5 outline-none focus:border-leaf"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Час (хв)">
              <input
                type="number"
                min={1}
                value={draft.cookTimeMinutes}
                onChange={(e) =>
                  setDraft({ ...draft, cookTimeMinutes: Number(e.target.value) || 1 })
                }
                className="w-full rounded-xl border border-line bg-cream/60 px-3 py-2.5 outline-none focus:border-leaf"
              />
            </Field>
            <Field label="Порції">
              <input
                type="number"
                min={1}
                value={draft.servings}
                onChange={(e) =>
                  setDraft({ ...draft, servings: Number(e.target.value) || 1 })
                }
                className="w-full rounded-xl border border-line bg-cream/60 px-3 py-2.5 outline-none focus:border-leaf"
              />
            </Field>
          </div>

          <Field label="Посилання на джерело">
            <input
              value={draft.sourceUrl}
              onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })}
              className="w-full rounded-xl border border-line bg-cream/60 px-3 py-2.5 outline-none focus:border-leaf"
              placeholder="Опційно для ручного рецепта"
            />
          </Field>

          <Field label="URL фото">
            <input
              value={draft.imageUrl}
              onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}
              className="w-full rounded-xl border border-line bg-cream/60 px-3 py-2.5 outline-none focus:border-leaf"
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            {(Object.keys(MEAL_LABELS) as MealType[]).map((m) => {
              const on = draft.mealTypes.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      mealTypes: on
                        ? draft.mealTypes.filter((x) => x !== m)
                        : [...draft.mealTypes, m],
                    })
                  }
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs",
                    on ? "bg-leaf text-cream" : "bg-mist text-ink-soft",
                  )}
                >
                  {MEAL_LABELS[m]}
                </button>
              );
            })}
<button
                type="button"
                className="rounded-lg bg-leaf/10 px-3 py-1.5 text-xs text-leaf-deep"
              >
                Бачать усі на сайті
              </button>
            </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-display)] text-xl text-leaf-deep">
                Інгредієнти
              </h2>
              <button
                type="button"
                onClick={() =>
                  setDraft({
                    ...draft,
                    ingredients: [
                      ...draft.ingredients,
                      { name: "", amount: 1, unit: "г", aisle: "produce" },
                    ],
                  })
                }
                className="inline-flex items-center gap-1 text-sm text-leaf"
              >
                <Plus className="size-4" /> Рядок
              </button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[4.5rem_4.5rem_minmax(0,1fr)_2.25rem] gap-2 px-1 text-[11px] uppercase tracking-wide text-ink-soft">
                <span>К-сть</span>
                <span>Од.</span>
                <span>Назва</span>
                <span />
              </div>
              {draft.ingredients.map((ing, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[4.5rem_4.5rem_minmax(0,1fr)_2.25rem] items-center gap-2"
                >
                  <input
                    type="number"
                    step="any"
                    value={ing.amount}
                    onChange={(e) => {
                      const ingredients = [...draft.ingredients];
                      ingredients[idx] = { ...ing, amount: Number(e.target.value) || 0 };
                      setDraft({ ...draft, ingredients });
                    }}
                    className="w-full rounded-xl border border-line bg-cream/60 px-3 py-2 outline-none focus:border-leaf"
                  />
                  <input
                    value={ing.unit}
                    onChange={(e) => {
                      const ingredients = [...draft.ingredients];
                      ingredients[idx] = { ...ing, unit: e.target.value };
                      setDraft({ ...draft, ingredients });
                    }}
                    placeholder="г"
                    className="w-full rounded-xl border border-line bg-cream/60 px-3 py-2 outline-none focus:border-leaf"
                  />
                  <input
                    value={ing.name}
                    onChange={(e) => {
                      const ingredients = [...draft.ingredients];
                      ingredients[idx] = { ...ing, name: e.target.value };
                      setDraft({ ...draft, ingredients });
                    }}
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      if (!raw) return;
                      if (
                        /^[\d¼½¾⅓⅔]/.test(raw) ||
                        /\d+\s*(?:g|kg|ml|l|oz|cup|tsp|tbsp|г|кг|мл|л|ст\.?\s*л|ч\.?\s*л)\b/i.test(
                          raw,
                        )
                      ) {
                        const ingredients = [...draft.ingredients];
                        ingredients[idx] = smartParseIngredient(raw);
                        setDraft({ ...draft, ingredients });
                      }
                    }}
                    placeholder="напр. борошно"
                    className="min-w-0 w-full rounded-xl border border-line bg-cream/60 px-3 py-2 outline-none focus:border-leaf"
                  />
                  <button
                    type="button"
                    aria-label="Видалити"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        ingredients: draft.ingredients.filter((_, i) => i !== idx),
                      })
                    }
                    className="flex items-center justify-center rounded-xl text-ink-soft hover:text-amber"
                  >
                    <Trash2 className="size-4" />
                  </button>
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
                  setDraft({
                    ...draft,
                    steps: [...draft.steps, { order: draft.steps.length + 1, text: "" }],
                  })
                }
                className="inline-flex items-center gap-1 text-sm text-leaf"
              >
                <Plus className="size-4" /> Крок
              </button>
            </div>
            <div className="space-y-2">
              {draft.steps.map((step, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="mt-2.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-leaf text-xs text-cream">
                    {idx + 1}
                  </span>
                  <textarea
                    value={step.text}
                    onChange={(e) => {
                      const steps = [...draft.steps];
                      steps[idx] = { ...step, text: e.target.value };
                      setDraft({ ...draft, steps });
                    }}
                    rows={2}
                    className="w-full flex-1 rounded-xl border border-line bg-cream/60 px-3 py-2 outline-none focus:border-leaf"
                  />
                  <button
                    type="button"
                    aria-label="Видалити крок"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        steps: draft.steps.filter((_, i) => i !== idx),
                      })
                    }
                    className="mt-2 text-ink-soft hover:text-amber"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={() => void save()}
              className="rounded-xl bg-leaf px-6 py-3 text-sm font-medium text-cream hover:bg-leaf-deep"
            >
              Зберегти в сімейну книгу
            </button>
            <button
              type="button"
              onClick={() => {
                if (tab === "manual") setDraft(emptyDraft());
                else setDraft(null);
              }}
              className="rounded-xl bg-mist px-5 py-3 text-sm text-ink-soft"
            >
              Скинути
            </button>
          </div>
        </section>
      )}

      {error && <p className="mt-4 text-sm text-amber">{error}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm text-ink-soft">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export default function AddRecipePage() {
  return (
    <AuthGate>
      <Suspense
        fallback={
          <div className="mx-auto max-w-3xl px-4 py-20 text-ink-soft">Завантаження…</div>
        }
      >
        <AddRecipeInner />
      </Suspense>
    </AuthGate>
  );
}
