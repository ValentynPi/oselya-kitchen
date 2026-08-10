"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { DRINK_SUBGROUPS, RECIPE_GROUPS } from "@/lib/ai";
import { cn } from "@/lib/utils";

type CategoryPickerProps = {
  value: string | null;
  predicted?: string | null;
  extraGroups?: string[];
  drinkSubgroup: string | null;
  onChange: (categoryName: string | null, drinkSubgroup: string | null) => void;
};

export function CategoryPicker({
  value,
  predicted,
  extraGroups = [],
  drinkSubgroup,
  onChange,
}: CategoryPickerProps) {
  const [draftName, setDraftName] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const builtin = useMemo(() => new Set<string>(RECIPE_GROUPS), []);
  const customGroups = useMemo(() => {
    const names = new Set<string>();
    for (const name of extraGroups) {
      const trimmed = name.trim();
      if (trimmed && !builtin.has(trimmed as (typeof RECIPE_GROUPS)[number])) {
        names.add(trimmed);
      }
    }
    if (value && !builtin.has(value as (typeof RECIPE_GROUPS)[number])) {
      names.add(value);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "uk"));
  }, [extraGroups, value, builtin]);

  const showDrinks =
    value === "Напої" || (!value && predicted === "Напої");

  function applyCustom() {
    const name = draftName.trim().replace(/\s+/g, " ");
    if (!name) return;
    if (name.length > 40) return;
    onChange(name, name === "Напої" ? drinkSubgroup : null);
    setDraftName("");
    setShowCustom(false);
  }

  return (
    <div className="rounded-xl bg-mist/80 px-4 py-3">
      <p className="text-sm text-ink-soft">
        Група:{" "}
        <span className="font-medium text-leaf">
          {value ?? `Авто · ${predicted ?? "…"}`}
        </span>
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(null, null)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs",
            value === null
              ? "bg-leaf text-cream"
              : "bg-surface text-ink-soft ring-1 ring-line",
          )}
        >
          Авто
        </button>

        {RECIPE_GROUPS.map((group) => (
          <button
            key={group}
            type="button"
            onClick={() => onChange(group, group === "Напої" ? drinkSubgroup : null)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs",
              value === group
                ? "bg-leaf text-cream"
                : "bg-surface text-ink-soft ring-1 ring-line",
            )}
          >
            {group}
          </button>
        ))}

        {customGroups.map((group) => (
          <button
            key={group}
            type="button"
            onClick={() => onChange(group, null)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs",
              value === group
                ? "bg-leaf text-cream"
                : "bg-surface text-ink-soft ring-1 ring-amber/50",
            )}
          >
            {group}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setShowCustom((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg bg-surface px-3 py-1.5 text-xs text-leaf ring-1 ring-line hover:ring-leaf"
        >
          <Plus className="size-3.5" />
          Своя
        </button>
      </div>

      {showCustom && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line/50 pt-3">
          <input
            id="custom-category-name"
            name="custom-category-name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyCustom();
              }
            }}
            placeholder="Назва категорії, напр. Гриль"
            maxLength={40}
            className="min-w-[12rem] flex-1 rounded-lg border border-line bg-cream/60 px-3 py-1.5 text-sm outline-none focus:border-leaf"
          />
          <button
            type="button"
            onClick={applyCustom}
            disabled={!draftName.trim()}
            className="rounded-lg bg-leaf px-3 py-1.5 text-xs text-cream disabled:opacity-40"
          >
            Додати
          </button>
        </div>
      )}

      {showDrinks && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line/50 pt-3">
          <span className="w-full text-xs text-ink-soft">Підгрупа напоїв</span>
          <button
            type="button"
            onClick={() => onChange(value ?? "Напої", null)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs",
              drinkSubgroup === null
                ? "bg-leaf text-cream"
                : "bg-surface text-ink-soft ring-1 ring-line",
            )}
          >
            Без підгрупи
          </button>
          {DRINK_SUBGROUPS.map((sub) => (
            <button
              key={sub}
              type="button"
              onClick={() => onChange(value ?? "Напої", sub)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs",
                drinkSubgroup === sub
                  ? "bg-leaf text-cream"
                  : "bg-surface text-ink-soft ring-1 ring-line",
              )}
            >
              {sub}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
