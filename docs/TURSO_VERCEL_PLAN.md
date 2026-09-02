# План подключения Turso и Vercel

## Цель

Перенести текущую рабочую базу `data/preview-clean.db` в Turso без потери комнат, игроков, сезонов, PIN, клеток, заданий, наград и настроек уведомлений, затем развернуть Next.js-приложение на Vercel с защищёнными cron-задачами.

## 1. Подготовка и контрольная копия

1. Остановить локальные игровые действия на время переноса.
2. Скопировать `data/preview-clean.db` в отдельный датированный backup.
3. Выполнить локально:
   - `npm run db:init`
   - `npm run typecheck`
   - `npm test`
   - `npm run test:achievements`
   - `npm run test:scenario`
   - `npm run test:multiroom`
   - `npm run build`
4. Проверить, что `.env`, `.env.local`, файлы базы и backup не отслеживаются Git.
5. Если репозиторий когда-либо публиковался с секретами, перевыпустить соответствующие токены до деплоя.

## 2. Создание Turso из текущей SQLite-базы

На Windows официальный Turso CLI используется через WSL; альтернативно базу можно создать через панель Turso.

Вариант с CLI:

```bash
turso auth login
turso db create levita-golden-savanna --from-file ./data/preview-clean.db --wait
turso db show --url levita-golden-savanna
turso db tokens create levita-golden-savanna
```

Сохранить полученные значения только в менеджере секретов:

```text
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
```

Официальная документация допускает импорт существующего SQLite-файла через `--from-file`. Для повторяемых переносов также можно использовать `.dump` и загрузку через `turso db shell`.

## 3. Проверка данных в Turso

До подключения Vercel выполнить контрольные запросы:

```bash
turso db shell levita-golden-savanna "SELECT COUNT(*) FROM users;"
turso db shell levita-golden-savanna "SELECT COUNT(*) FROM memberships;"
turso db shell levita-golden-savanna "SELECT name, status, final_prize FROM seasons ORDER BY created_at DESC LIMIT 3;"
turso db shell levita-golden-savanna "SELECT COUNT(*) FROM board_cell_configs;"
turso db shell levita-golden-savanna "SELECT r.slug, COUNT(m.id) FROM rooms r LEFT JOIN memberships m ON m.room_id = r.id GROUP BY r.id;"
```

Сверить результаты с локальной базой. Отдельно проверить активный сезон, позиции игроков, количество доступных бросков и текущие задания.

## 4. Подготовка приложения к serverless

1. Оставить локальную разработку на `file:./data/preview-clean.db`.
2. Для Vercel использовать удалённые `TURSO_DATABASE_URL` и `TURSO_AUTH_TOKEN`.
3. Перед production-деплоем вынести изменения схемы из холодного старта приложения в отдельный управляемый шаг миграции. Это исключит одновременный `ALTER TABLE` от нескольких Vercel Functions.
4. Рассмотреть замену `@libsql/client` на рекомендуемый Turso пакет `@tursodatabase/serverless/compat`; совместимый интерфейс позволит сохранить текущие вызовы `createClient`.
5. Для Preview Deployment использовать отдельную тестовую Turso-базу, чтобы preview-ветки не меняли production-данные.

## 5. Переменные Vercel

В Vercel → Project → Settings → Environment Variables добавить вручную:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `SESSION_SECRET` — отдельная случайная строка не короче 32 символов
- `PUBLIC_APP_URL` — production-домен
- `MAX_API_BASE`
- `CRON_SECRET` — отдельная случайная строка
- `BLOB_READ_WRITE_TOKEN` — если оставляем резервные копии в Vercel Blob
- ссылки на Яндекс Карты, 2ГИС и Google для обеих студий

`OWNER_NAME` и `OWNER_PIN` необязательны и нужны только для автоматического bootstrap старой единственной комнаты. Токены и chat ID ботов вводятся руководителем в настройках своей комнаты и сохраняются в Turso. Секреты не добавлять в `vercel.json`, URL деплоя или Git.

## 6. Первый деплой Vercel

1. Подключить GitHub-репозиторий к Vercel.
2. Framework Preset: Next.js; build-команда: `npm run build`.
3. Сначала создать Preview Deployment с отдельной тестовой Turso-базой.
4. Создать две тестовые комнаты и проверить общие ссылки, вход владельца и игрока, независимые карты, начисление и отмену броска, один тестовый ход, задание, сокровище, настройку финального приза и разные чаты ботов.
5. После проверки переключить production environment variables на основную Turso-базу и выполнить production deployment.

## 7. Cron и MAX

`vercel.json` уже содержит:

- напоминания — каждый час;
- сводка — `21:05 UTC`, то есть `00:05 Europe/Moscow`;
- резервная копия — ежедневно.

Vercel передаёт `CRON_SECRET` в заголовке `Authorization: Bearer ...`; текущие обработчики должны сравнивать его с переменной окружения. После деплоя проверить раздел Vercel → Cron Jobs и логи каждого маршрута.

В каждой комнате выполнить по одному контролируемому тесту MAX/Telegram и убедиться, что сообщение пришло только в указанные для неё чаты. Затем проверить начисление броска, достижение и ежедневную сводку. Сообщение о ручной выдаче обычного сокровища в чат не отправляется.

## 8. Приёмка и откат

Приёмка:

- у всех игроков правильные позиции и PIN;
- ссылки, карты, игроки, награды и уведомления двух комнат не пересекаются;
- активный сезон, приз и дата совпадают;
- новые сезоны открываются с нулевыми бросками, сокровищами и достижениями;
- 15 новых достижений считают только текущий сезон;
- MAX и cron не создают дублей;
- backup успешно сохраняется и читается.

Откат:

1. Не удалять исходный SQLite и датированный backup до недели стабильной production-работы.
2. При критической ошибке вернуть предыдущий Vercel Deployment и прежние переменные подключения.
3. Для восстановления Turso создать новую базу из сохранённого SQLite или SQL dump, проверить её и только затем поменять `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN`.

## Официальные источники

- Turso: создание базы из SQLite-файла — https://docs.turso.tech/cli/db/create
- Turso TypeScript quickstart — https://docs.turso.tech/sdk/ts/quickstart
- Turso dump и shell — https://docs.turso.tech/cli/db/shell
- Vercel Cron Jobs — https://vercel.com/docs/cron-jobs
- Защита cron через `CRON_SECRET` — https://vercel.com/docs/cron-jobs/manage-cron-jobs
