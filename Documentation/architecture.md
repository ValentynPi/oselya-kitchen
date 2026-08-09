# Сімейний кулінарний помічник «Оселя»

## Стек (Фаза 1 — веб)

| Шар | Технологія |
|-----|------------|
| Клієнт (UI) | Next.js App Router + TypeScript + Tailwind CSS |
| Стан UI | Zustand (локальний UX: демо-сесія, історія пошуку тощо) |
| Серверний API | Route Handlers (`src/app/api/*`) |
| База даних | **Turso** (libSQL / SQLite), free tier |
| ORM | Drizzle ORM + `@libsql/client` |
| ШІ | OpenAI лише на сервері (`OPENAI_API_KEY`) |
| Автентифікація | Демо Google-вхід (`AuthGate`); далі — NextAuth Google Provider |

## Клієнт / сервер

- **Клієнт** — браузерний UI (сторінки App Router). Не має доступу до секретів і не звертається до БД напряму.
- **Сервер** — Route Handlers: читання/запис сімейних даних у Turso та пайплайн імпорту/ШІ.
- Спільні дані сім’ї (рецепти, категорії, вибране, план меню, список покупок) живуть у **серверній БД**, не у файлі JSON і не через GitHub Contents.

```
[Browser / Zustand]
        │  fetch
        ▼
[Next.js Route Handlers]  ← OPENAI_*, TURSO_*
        │  Drizzle + @libsql/client
        ▼
[Turso libSQL]  або  [локальний file:./data/kitchen.db]
```

## База даних (Turso)

**Чому Turso:** безкоштовний тариф (≈5 GB, щедрі читання/записи, $0) під спільну сімейну книгу без окремого Postgres.

| Середовище | Підключення |
|------------|-------------|
| Production / спільний дев | `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` |
| Локальна розробка без Turso | Якщо `TURSO_DATABASE_URL` не задано — fallback на локальний SQLite, напр. `file:./data/kitchen.db` |

Колишній `data/shared-kitchen.json` (+ синхронізація через GitHub Contents) **більше не є джерелом правди**. JSON можна тимчасово використати лише як одноразовий seed у БД.

### Домен у БД

| Сутність | Примітки |
|----------|----------|
| `categories` | Ієрархія (підкатегорії при >10 рецептах) |
| `recipes` | Інгредієнти та кроки — JSON-колонки OK; поля `authorId` / `familyId` під майбутню автентифікацію |
| `favorites` | Персональне вибране |
| `meal_plan_entries` | План меню / порції |
| `shopping_items` | Список покупок |

Історія пошуку може лишатися **лише на клієнті** (Zustand / localStorage).

## Змінні середовища

| Змінна | Призначення |
|--------|-------------|
| `TURSO_DATABASE_URL` | URL Turso (або `file:…` для локального SQLite) |
| `TURSO_AUTH_TOKEN` | Токен Turso (для хмарної БД) |
| `OPENAI_API_KEY` | Ключ ChatGPT для збагачення імпорту |
| `OPENAI_MODEL` | Опційно; за замовчуванням `gpt-4o-mini` |
| `OPENAI_BASE_URL` | Опційно; OpenAI-сумісний proxy |

Ключі лише в `.env.local` / Vercel Environment Variables — **ніколи на клієнті**.

## Володіння даними

| Дані | Де живуть |
|------|-----------|
| Рецепти, категорії, favorites, meal plan, shopping | Серверна БД через API |
| Демо-профіль користувача | Клієнт (до NextAuth) |
| Історія пошуку | Клієнт (допустимо) |
| Чернетки імпорту до «Зберегти» | Клієнт → після збереження `POST /api/recipes` |

У моделі залишаються `authorId` / `familyId` для майбутнього сімейного scoping; зараз автентифікація демо.

Zustand (`hydrateFromServer` / `SharedKitchenSync`) підвантажує з API паралельно рецепти з категоріями, вибране (якщо є `userId`), план меню та список покупок; мутації цих доменів пишуть у відповідні route handlers і оновлюють локальний кеш з відповідей. У `localStorage` лишаються лише демо-сесія (`user`) та історія пошуку.

## Пайплайн ШІ (лише сервер)

1. Користувач імпортує URL або текст на клієнті.
2. `POST /api/extract` або `POST /api/parse-text` — витяг / парсинг на сервері.
3. Переклад (за потреби) → `enrichRecipeWithAi` (перевірка інгредієнтів/кроків, нормалізація українською, категорія).
4. Результат повертається клієнту для перегляду; після збереження — запис у БД через `/api/recipes`.

Без `OPENAI_API_KEY` імпорт працює на евристиках (`src/lib/ai.ts`) з попередженням.

## Поверхня API

| Маршрут | Роль |
|---------|------|
| `GET` / `POST` / … `/api/recipes` | CRUD спільної кухні (рецепти + пов’язані оновлення) |
| `POST /api/categories` | Створення / забезпечення категорії |
| `GET` / `PUT` `/api/favorites` | Персональне вибране (`userId`) |
| `GET` / `POST` / `PATCH` / `DELETE` `/api/meal-plan` | План меню сім’ї (`familyId`) |
| `GET` / `PUT` `/api/shopping` | Список покупок (клієнт рахує, PUT зберігає) |
| `POST /api/extract` | Імпорт з URL → extract → translate → enrich |
| `POST /api/parse-text` | Імпорт з тексту → parse → translate → enrich |

Усі маршрути з секретами й БД — тільки Route Handlers.

## Відповідність вимогам PDF

| Вимога | Реалізація |
|--------|------------|
| Google-автентифікація, без анонімів | `AuthGate` + демо Google; далі NextAuth |
| Спільні / приватні рецепти | `visibility` + фільтр `visibleRecipes()`; спільне — у БД |
| ШІ-категоризація | `src/lib/ai.ts` + `src/lib/ai-enrich.ts` на сервері |
| Підкатегорії при >10 | `maybeSplitCategory` |
| Імпорт за URL | `/api/extract` + `sourceUrl` |
| Картка рецепта | `/recipes/[id]` |
| Вибране з пріоритетом | `sortWithFavorites` + таблиця `favorites` |
| Пошук + фільтри + історія | `/search` (історія — клієнт) |
| План меню + порції | `/plan` + `scaleIngredients` + `meal_plan_entries` |
| Список покупок | `/shopping` + `buildShoppingList` + `shopping_items` |
