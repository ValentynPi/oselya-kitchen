"use client";

import { useKitchenStore } from "@/lib/store";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const user = useKitchenStore((s) => s.user);
  const signIn = useKitchenStore((s) => s.signIn);

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
        <p className="font-[family-name:var(--font-display)] text-3xl text-leaf-deep">
          Потрібен вхід
        </p>
        <p className="mt-3 text-ink-soft">
          Анонімне використання заборонено. Увійдіть через Google, щоб бачити сімейні рецепти,
          план меню та покупки.
        </p>
        <button
          type="button"
          onClick={signIn}
          className="mt-6 rounded-xl bg-leaf px-5 py-3 text-sm text-cream hover:bg-leaf-deep"
        >
          Увійти з Google
        </button>
        <p className="mt-3 text-xs text-ink-soft">
          Демо-режим: локальний профіль Pidlypnyi (готово до NextAuth).
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
