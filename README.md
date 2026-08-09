# Family Kitchen

Сімейний кулінарний помічник — веб-додаток Фази 1.

## Запуск

```bash
npm install
npm run dev
```

Відкрийте [http://localhost:3000](http://localhost:3000).

Демо-режим: кнопка «Увійти з Google» використовує локальний сімейний профіль без реального OAuth (готово до підключення NextAuth).

## Дані та середовище

Спільна кухня — у **Turso** (libSQL) через серверні Route Handlers і Drizzle. Локально без `TURSO_DATABASE_URL` можливий fallback на файл SQLite (`file:./data/kitchen.db`).

Скопіюйте `.env.example` → `.env.local` і за потреби задайте:

- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` — хмарна БД
- `OPENAI_API_KEY` (опційно `OPENAI_MODEL`) — ШІ-збагачення імпорту на сервері

## Документація

- `Documentation/requirements.md` — функційні вимоги Фази 1
- `Documentation/architecture.md` — клієнт/сервер, Turso, API, ШІ
