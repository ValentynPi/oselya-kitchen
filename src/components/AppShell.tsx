"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Heart,
  LogIn,
  LogOut,
  Plus,
  Search,
  ShoppingCart,
  Soup,
} from "lucide-react";
import { useKitchenStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const links = [
  { href: "/add", label: "Додати", icon: Plus },
  { href: "/recipes", label: "Рецепти", icon: Soup },
  { href: "/search", label: "Пошук", icon: Search },
  { href: "/plan", label: "Меню", icon: CalendarDays },
  { href: "/shopping", label: "Покупки", icon: ShoppingCart },
  { href: "/favorites", label: "Вибране", icon: Heart },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const user = useKitchenStore((s) => s.user);
  const signIn = useKitchenStore((s) => s.signIn);
  const signOut = useKitchenStore((s) => s.signOut);
  const isHome = pathname === "/";

  return (
    <div className="grain min-h-screen">
      <div className="relative z-[1]">
        <header
          className={cn(
            "sticky top-0 z-40 border-b border-line/60 backdrop-blur-md",
            isHome ? "bg-transparent border-transparent" : "bg-cream/80",
          )}
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <Link href="/" className="group flex items-baseline gap-2">
              <span className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-leaf-deep sm:text-3xl">
                Оселя
              </span>
              <span className="hidden text-xs text-ink-soft sm:inline">
                сімейна кухня
              </span>
            </Link>

            <nav className="hidden items-center gap-1 md:flex">
              {links.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-leaf text-cream"
                        : "text-ink-soft hover:bg-mist hover:text-ink",
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-2">
              <Link
                href="/add"
                className="hidden items-center gap-1.5 rounded-lg bg-amber px-3 py-2 text-sm font-medium text-ink transition hover:bg-amber-soft sm:flex"
              >
                <Plus className="size-4" />
                Додати рецепт
              </Link>
              {user ? (
                <button
                  type="button"
                  onClick={signOut}
                  className="flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm text-cream transition hover:bg-leaf-deep"
                >
                  <span className="hidden max-w-28 truncate sm:inline">{user.name}</span>
                  <LogOut className="size-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={signIn}
                  className="flex items-center gap-2 rounded-lg bg-leaf px-3 py-2 text-sm text-cream transition hover:bg-leaf-deep"
                >
                  <LogIn className="size-4" />
                  Google
                </button>
              )}
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto border-t border-line/50 px-2 py-2 md:hidden">
            {links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-xs",
                    active ? "bg-leaf text-cream" : "text-ink-soft",
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main>{children}</main>

        <footer className="mx-auto mt-20 max-w-6xl border-t border-line/70 px-4 py-10 text-sm text-ink-soft sm:px-6">
          <p className="font-[family-name:var(--font-display)] text-lg text-leaf-deep">Оселя</p>
          <p className="mt-1 max-w-md">
            Головне — зібрати рецепти з посилань або створити свої. Далі: категорії, меню й
            покупки для всієї родини.
          </p>
        </footer>
      </div>
    </div>
  );
}
