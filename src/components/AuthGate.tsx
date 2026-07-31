"use client";

import { useEffect } from "react";
import { useKitchenStore } from "@/lib/store";

/** Auto-enters demo profile so shared links work without a login wall. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const user = useKitchenStore((s) => s.user);
  const signIn = useKitchenStore((s) => s.signIn);

  useEffect(() => {
    if (!user) signIn();
  }, [user, signIn]);

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[40vh] max-w-lg flex-col items-center justify-center px-4 text-center text-ink-soft">
        Відкриваємо сімейну кухню…
      </div>
    );
  }

  return <>{children}</>;
}
