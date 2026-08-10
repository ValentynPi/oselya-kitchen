"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, ClipboardPaste, Link2, PenLine, Sparkles } from "lucide-react";
import { useKitchenStore } from "@/lib/store";
import { sortWithFavorites } from "@/lib/kitchen";
import { RecipeCard } from "@/components/RecipeCard";

export default function HomePage() {
  const user = useKitchenStore((s) => s.user);
  const signIn = useKitchenStore((s) => s.signIn);
  const favorites = useKitchenStore((s) => s.favorites);
  const visibleRecipes = useKitchenStore((s) => s.visibleRecipes);
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => setMounted(true), []);

  const recipes = mounted
    ? sortWithFavorites(visibleRecipes(), new Set(favorites)).slice(0, 6)
    : [];

  function goAdd(mode: "url" | "manual" | "text", link?: string) {
    if (!user) {
      signIn();
    }
    if (mode === "url" && link?.trim()) {
      router.push(`/add?url=${encodeURIComponent(link.trim())}`);
      return;
    }
    if (mode === "text") {
      router.push("/add?mode=text");
      return;
    }
    router.push(mode === "manual" ? "/add?mode=manual" : "/add");
  }

  return (
    <>
      <section className="relative min-h-[92vh] overflow-hidden">
        <Image
          src="https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=2000&q=80"
          alt="Сімейна кухня"
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-leaf-deep/92 via-leaf-deep/70 to-leaf-deep/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-leaf-deep/55 via-transparent to-transparent" />

        <div className="relative mx-auto flex min-h-[92vh] max-w-6xl flex-col justify-end px-4 pb-14 pt-28 sm:px-6 sm:pb-20">
          <p className="animate-rise font-[family-name:var(--font-display)] text-5xl font-bold tracking-tight text-cream sm:text-7xl md:text-8xl">
            Оселя
          </p>
          <h1 className="animate-rise-delay mt-4 max-w-2xl text-xl text-cream/95 sm:text-2xl">
            Збережіть рецепт з посилання, тексту — або напишіть свій
          </h1>
          <p className="animate-rise-delay-2 mt-3 max-w-lg text-base text-cream/80">
            Вставте URL або скопійований текст: зберемо назву, інгредієнти й кроки в одну сімейну
            картку.
          </p>

          <div className="animate-rise-delay-2 mt-8 max-w-2xl rounded-2xl bg-cream/12 p-3 backdrop-blur-md ring-1 ring-cream/25 sm:p-4">
            <label className="flex flex-col gap-3 sm:flex-row sm:items-center" htmlFor="home-recipe-url">
              <div className="relative flex-1">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-cream/70" />
                <input
                  id="home-recipe-url"
                  name="home-recipe-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") goAdd("url", url);
                  }}
                  placeholder="Вставте посилання на рецепт…"
                  className="w-full rounded-xl border-0 bg-cream/95 py-3.5 pl-10 pr-4 text-ink outline-none placeholder:text-ink-soft/70"
                />
              </div>
              <button
                type="button"
                onClick={() => goAdd("url", url)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber px-5 py-3.5 text-sm font-medium text-ink transition hover:bg-amber-soft"
              >
                <Sparkles className="size-4" />
                Створити з URL
              </button>
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => goAdd("text")}
                className="inline-flex items-center gap-2 text-sm text-cream/90 hover:text-cream"
              >
                З тексту
                <ArrowRight className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => goAdd("manual")}
                className="inline-flex items-center gap-2 text-sm text-cream/90 hover:text-cream"
              >
                <PenLine className="size-4" />
                Вручну
                <ArrowRight className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:grid-cols-3 sm:px-6">
        <Link
          href="/add"
          className="group rounded-3xl bg-leaf-deep p-8 text-cream transition hover:bg-leaf"
        >
          <Link2 className="size-7 opacity-90" />
          <h2 className="mt-5 font-[family-name:var(--font-display)] text-2xl">З посилання</h2>
          <p className="mt-2 text-sm text-cream/75">
            Автоматичне витягування рецепта зі сайту чи соцмереж.
          </p>
          <span className="mt-6 inline-flex items-center gap-1 text-sm text-amber-soft group-hover:gap-2 transition-all">
            Відкрити <ArrowRight className="size-4" />
          </span>
        </Link>
        <Link
          href="/add?mode=text"
          className="group rounded-3xl bg-surface/80 p-8 ring-1 ring-line/70 transition hover:bg-surface"
        >
          <ClipboardPaste className="size-7 text-leaf" />
          <h2 className="mt-5 font-[family-name:var(--font-display)] text-2xl text-leaf-deep">
            З тексту
          </h2>
          <p className="mt-2 text-sm text-ink-soft">
            Вставте скопійований рецепт — розберемо на інгредієнти та кроки.
          </p>
          <span className="mt-6 inline-flex items-center gap-1 text-sm text-leaf group-hover:gap-2 transition-all">
            Відкрити <ArrowRight className="size-4" />
          </span>
        </Link>
        <Link
          href="/add?mode=manual"
          className="group rounded-3xl bg-surface/80 p-8 ring-1 ring-line/70 transition hover:bg-surface"
        >
          <PenLine className="size-7 text-leaf" />
          <h2 className="mt-5 font-[family-name:var(--font-display)] text-2xl text-leaf-deep">
            Своїми руками
          </h2>
          <p className="mt-2 text-sm text-ink-soft">
            Назва, інгредієнти, кроки, фото — повна картка з нуля.
          </p>
          <span className="mt-6 inline-flex items-center gap-1 text-sm text-leaf group-hover:gap-2 transition-all">
            Відкрити <ArrowRight className="size-4" />
          </span>
        </Link>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-3xl text-leaf-deep">
              Уже в книзі
            </h2>
            <p className="mt-1 text-ink-soft">Сімейна колекція після імпорту та ручного додавання.</p>
          </div>
          <Link href="/recipes" className="text-sm text-leaf hover:underline">
            Усі рецепти
          </Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              badge={favorites.includes(recipe.id) ? "Вибране" : undefined}
            />
          ))}
        </div>
      </section>
    </>
  );
}
