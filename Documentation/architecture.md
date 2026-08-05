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
| ШІ-категоризація | `src/lib/ai.ts` (евристика) + `src/lib/ai-enrich.ts` (Gemini після імпорту) |
| Підкатегорії при >10 | `maybeSplitCategory` |
| Імпорт за URL | `/api/extract` + `extractRecipeFromUrl`, збереження `sourceUrl` |
| Картка рецепта | `/recipes/[id]` |
| Вибране з пріоритетом | `sortWithFavorites` у списках |
| Пошук за інгредієнтами + фільтри + історія | `/search` |
| План меню + порції | `/plan` + `scaleIngredients` |
| Список покупок + агрегація + відділи | `/shopping` + `buildShoppingList` |

## Спільна книга рецептів

Усі додані рецепти зберігаються спільно (`/api/recipes` + `data/shared-kitchen.json`).
На Vercel записи йдуть у GitHub через `GITHUB_TOKEN`, тож кожен відвідувач бачить ті самі рецепти.

## Gemini ШІ (імпорт)

Після витягування та перекладу `/api/extract` і `/api/parse-text` викликають `enrichRecipeWithAi`:
модель перевіряє інгредієнти/кроки, прибирає сміття, нормалізує українською й обирає категорію.

Потрібен `GEMINI_API_KEY` у `.env.local` (локально) і в **Vercel → Project → Settings → Environment Variables**.
Без ключа імпорт працює на евристиках і показує попередження.
