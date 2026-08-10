"use client";

import { useMemo, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AISLE_LABELS } from "@/lib/kitchen";
import { useKitchenStore } from "@/lib/store";
import type { StoreAisle } from "@/lib/types";
import { cn, formatAmount } from "@/lib/utils";

const AISLE_ORDER: StoreAisle[] = [
  "produce",
  "meat",
  "dairy",
  "bakery",
  "pantry",
  "frozen",
  "other",
];

export default function ShoppingPage() {
  const shoppingList = useKitchenStore((s) => s.shoppingList);
  const generateShoppingList = useKitchenStore((s) => s.generateShoppingList);
  const toggleShoppingItem = useKitchenStore((s) => s.toggleShoppingItem);
  const addCustomShoppingItem = useKitchenStore((s) => s.addCustomShoppingItem);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState("шт");

  const grouped = useMemo(() => {
    const map = new Map<StoreAisle, typeof shoppingList>();
    for (const aisle of AISLE_ORDER) map.set(aisle, []);
    for (const item of shoppingList) {
      const list = map.get(item.aisle) ?? [];
      list.push(item);
      map.set(item.aisle, list);
    }
    return map;
  }, [shoppingList]);

  return (
    <AuthGate>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-4xl text-leaf-deep">
              Список покупок
            </h1>
            <p className="mt-2 text-ink-soft">
              Агрегація інгредієнтів з меню, групування за відділами, спільні галочки в реальному
              часі (локально для демо).
            </p>
          </div>
          <button
            type="button"
            onClick={() => generateShoppingList()}
            className="rounded-xl bg-leaf px-4 py-2.5 text-sm text-cream hover:bg-leaf-deep"
          >
            Оновити з меню
          </button>
        </div>

        {shoppingList.length === 0 ? (
          <div className="mt-10 rounded-2xl bg-surface/80 p-8 text-center ring-1 ring-line/70">
            <p className="text-ink-soft">Список порожній. Згенеруйте його з плану меню.</p>
            <button
              type="button"
              onClick={() => generateShoppingList()}
              className="mt-4 rounded-xl bg-amber px-4 py-2 text-sm text-ink"
            >
              Згенерувати
            </button>
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            {AISLE_ORDER.map((aisle) => {
              const items = grouped.get(aisle) ?? [];
              if (items.length === 0) return null;
              return (
                <section key={aisle}>
                  <h2 className="font-[family-name:var(--font-display)] text-xl text-leaf-deep">
                    {AISLE_LABELS[aisle]}
                  </h2>
                  <ul className="mt-3 space-y-2">
                    {items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => toggleShoppingItem(item.id)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-xl bg-surface/80 px-4 py-3 text-left ring-1 ring-line/60 transition",
                            item.checked && "opacity-55",
                          )}
                          style={
                            item.checked
                              ? { animation: "check-pop 0.25s ease" }
                              : undefined
                          }
                        >
                          <span className="flex items-center gap-3">
                            <span
                              className={cn(
                                "flex size-5 items-center justify-center rounded border",
                                item.checked
                                  ? "border-leaf bg-leaf text-cream"
                                  : "border-line",
                              )}
                            >
                              {item.checked ? "✓" : ""}
                            </span>
                            <span className={cn(item.checked && "line-through")}>
                              {item.name}
                              {!item.fromRecipes && (
                                <span className="ml-2 text-xs text-ink-soft">вручну</span>
                              )}
                            </span>
                          </span>
                          <span className="text-sm text-ink-soft">
                            {formatAmount(item.amount, item.unit)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        <section className="mt-10 rounded-2xl bg-surface/80 p-5 ring-1 ring-line/70">
          <h2 className="font-[family-name:var(--font-display)] text-xl text-leaf-deep">
            Додати товар
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <input
              id="shopping-item-name"
              name="shopping-item-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Назва"
              className="sm:col-span-2 rounded-xl border border-line bg-cream/50 px-3 py-2"
            />
            <input
              id="shopping-item-amount"
              name="shopping-item-amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              className="rounded-xl border border-line bg-cream/50 px-3 py-2"
            />
            <input
              id="shopping-item-unit"
              name="shopping-item-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="Од."
              className="rounded-xl border border-line bg-cream/50 px-3 py-2"
            />
          </div>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => {
              addCustomShoppingItem(name.trim(), amount, unit);
              setName("");
            }}
            className="mt-3 rounded-xl bg-leaf px-4 py-2 text-sm text-cream disabled:opacity-40"
          >
            Додати
          </button>
        </section>
      </div>
    </AuthGate>
  );
}
