# hack-4ddfbd63-team
Hackathon team repository for team

## EKT AI-консультант

MVP консультанта интернет-магазина электротехнической продукции. Приложение ищет товары в реальном EKT API, а OpenAI Responses API использует server-side tools для получения актуальных товарных данных.

### Запуск

1. Скопируйте `.env.example` в `.env.local` и заполните значения.
2. Установите зависимости: `npm install`.
3. Запустите приложение: `npm run dev`.
4. Откройте [http://localhost:3000](http://localhost:3000).

Проверки перед сборкой:

```bash
npm run typecheck
npm run lint
npm run build
```

### Переменные окружения

- `EKT_API_URL`, `EKT_API_USER`, `EKT_API_PASSWORD` — доступ к EKT API с Basic Auth.
- `OPENAI_API_KEY` — ключ OpenAI API.
- `OPENAI_MODEL` — необязательная модель, по умолчанию `gpt-5-mini`.
- `EKT_API_TIMEOUT_MS`, `EKT_SEARCH_MAX_PAGES`, `EKT_API_PER_PAGE` — необязательные настройки адаптера.

Все секреты читаются только в Route Handlers и server-only модулях. `.env.local` исключён из Git.

### Обнаруженная схема EKT API

- `GET /products`: `{ page, per_page, count, items[] }`; товар содержит `id`, `name`, `article`, `price`, `image`, `url`, `url_api_detail`, `offers`.
- `GET /products?page=2`: та же схема пагинации.
- `GET /products/detail?id=...`: `id`, `name`, `article`, `description`, `price`, `quantity`, `stores[]`, `image`, `url`, `offers`, `properties`.
- `stores[]`: `id`, `name`, `quantity`.
- `properties`: словарь характеристик; `RECOMMEND` содержит id рекомендованных товаров, если они заданы.
- В исследованных карточках отдельных полей категории, валюты и сертификатов не было. Адаптер не выдумывает их и вернёт `null`/пустой список.

Параметры `search`, `q` и `article` API игнорирует, отдельный search endpoint не обнаружен. Поэтому `searchProducts` загружает каталог постранично (`per_page=100`), нормализует данные и ранжирует совпадения локально.

### Ограничения MVP

Корзина хранится в памяти процесса и очищается после перезапуска. Перед каждым подтверждённым добавлением backend повторно получает детальную карточку и проверяет точный остаток.

### Аналоги и безопасная корзина

`findAnalogues(productId)` получает исходную карточку и характеристики EKT, предварительно отбирает кандидатов по категории и названию, затем детально проверяет кандидатов и детерминированно ранжирует только товары с фактическим остатком больше нуля. В результате доступны score, совпавшие характеристики, различия и данные для объяснения.

Корзина использует двухшаговый протокол:

1. `POST /api/cart/proposals` создаёт временный `CartProposal`, но не меняет корзину.
2. `POST /api/cart/proposals/{proposalId}/confirm` повторно получает товар из EKT и только после проверки количества и остатка изменяет demo cart.
3. `DELETE /api/cart/proposals/{proposalId}` отменяет предложение.

Confirm endpoint не принимает цену, остаток, название, product id или количество от frontend. Повторное подтверждение идемпотентно.

Автоматические тесты запускаются командой `npm test`.
