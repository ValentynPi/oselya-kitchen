"use client";

import { useEffect } from "react";
import { useKitchenStore } from "@/lib/store";

/** Hydrates recipes, favorites, meal plan, and shopping from server APIs. */
export function SharedKitchenSync() {
  const hydrateFromServer = useKitchenStore((s) => s.hydrateFromServer);
  const syncStatus = useKitchenStore((s) => s.syncStatus);
  const recipeCount = useKitchenStore((s) => s.recipes.length);

  useEffect(() => {
    void hydrateFromServer();
    const id = window.setInterval(() => {
      void hydrateFromServer();
    }, 30000);
    return () => window.clearInterval(id);
  }, [hydrateFromServer]);

  if (syncStatus === "error" && recipeCount === 0) {
    return (
      <div className="fixed bottom-3 left-3 right-3 z-50 mx-auto max-w-md rounded-xl bg-amber px-4 py-2 text-center text-xs text-ink shadow-lg sm:left-auto">
        Не вдалося синхронізувати спільну книгу рецептів. Спробуйте оновити сторінку.
      </div>
    );
  }

  return null;
}
