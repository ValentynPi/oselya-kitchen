"use client";

import { useEffect } from "react";
import { useKitchenStore } from "@/lib/store";

/** Loads the shared cookbook so every visitor sees the same recipes. */
export function SharedKitchenSync() {
  const hydrateShared = useKitchenStore((s) => s.hydrateShared);
  const syncStatus = useKitchenStore((s) => s.syncStatus);

  useEffect(() => {
    void hydrateShared();
    const id = window.setInterval(() => {
      void hydrateShared();
    }, 30000);
    return () => window.clearInterval(id);
  }, [hydrateShared]);

  if (syncStatus !== "error") return null;

  return (
    <div className="fixed bottom-3 left-3 right-3 z-50 mx-auto max-w-md rounded-xl bg-amber px-4 py-2 text-center text-xs text-ink shadow-lg sm:left-auto">
      Не вдалося синхронізувати спільну книгу рецептів. Спробуйте оновити сторінку.
    </div>
  );
}
