# Сімейний кулінарний помічник «Оселя»

## Стек (Фаза 1 — веб)

- Next.js (App Router) + TypeScript + Tailwind CSS
- Zustand (персистентний клієнтський стан сім’ї)
- Демо Google-вхід (заміна на NextAuth Google Provider)

## Відповідність вимогам PDF

| Вимога | Реалізація |
|--------|------------|
| Google-автентифікація, без анонімів | `AuthGate` + кнопка Google (демо-профіль) |
| Спільні / приватні рецепти | `visibility` + фільтр `visibleRecipes()` |
| ШІ-категоризація | `src/lib/ai.ts` — ключові слова, створення категорій |
| Підкатегорії при >10 | `maybeSplitCategory` |
| Імпорт за URL | `/import` + `parseImportUrl`, збереження `sourceUrl` |
| Картка рецепта | `/recipes/[id]` |
| Вибране з пріоритетом | `sortWithFavorites` у списках |
| Пошук за інгредієнтами + фільтри + історія | `/search` |
| План меню + порції | `/plan` + `scaleIngredients` |
| Список покупок + агрегація + відділи | `/shopping` + `buildShoppingList` |

## Спільна книга рецептів

Усі додані рецепти зберігаються спільно (`/api/recipes` + `data/shared-kitchen.json`).
На Vercel записи йдуть у GitHub через `GITHUB_TOKEN`, тож кожен відвідувач бачить ті самі рецепти.
