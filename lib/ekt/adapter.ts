import "server-only";

import type {
  EktProduct,
  EktStoreStock,
  ProductCertificate,
  ProductCharacteristic,
  ProductsPage,
} from "./types";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_SEARCH_PAGES = 20;
const DEFAULT_PER_PAGE = 100;
const CACHE_TTL_MS = 60_000;

type JsonRecord = Record<string, unknown>;

type CacheEntry = {
  expiresAt: number;
  value: ProductsPage;
};

const pageCache = new Map<number, CacheEntry>();

export class EktApiError extends Error {
  constructor(
    message: string,
    public readonly status: number = 502,
  ) {
    super(message);
    this.name = "EktApiError";
  }
}

function getConfig() {
  const baseUrl = process.env.EKT_API_URL?.trim().replace(/\/$/, "");
  const username = process.env.EKT_API_USER;
  const password = process.env.EKT_API_PASSWORD;

  if (!baseUrl || !username || !password) {
    throw new EktApiError(
      "EKT API не настроен: нужны EKT_API_URL, EKT_API_USER и EKT_API_PASSWORD.",
      503,
    );
  }

  return { baseUrl, username, password };
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function getByPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    const record = asRecord(current);
    return record ? record[part] : undefined;
  }, source);
}

function pick(source: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const value = getByPath(source, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function toText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const record = asRecord(value);
  if (record) {
    return toText(
      pick(record, ["name", "title", "value", "label", "description"]),
    );
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase().trim();
  if (["true", "yes", "1", "available", "in_stock", "в наличии"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "0", "unavailable", "out_of_stock", "нет в наличии"].includes(normalized)) {
    return false;
  }
  return null;
}

function toHttpUrl(value: unknown): string | null {
  const text = toText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeCharacteristics(value: unknown): ProductCharacteristic[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        const record = asRecord(entry);
        if (!record) return null;
        const name = toText(pick(record, ["name", "title", "label", "key", "property"]));
        const itemValue = toText(pick(record, ["value", "text", "description", "values.0"]));
        return name && itemValue ? { name, value: itemValue } : null;
      })
      .filter((entry): entry is ProductCharacteristic => entry !== null)
      .slice(0, 30);
  }

  const record = asRecord(value);
  if (!record) return [];
  const labels: Record<string, string> = {
    NOVINKA: "Новинка",
    ARTIKULPOSTAVSHCHIKA: "Артикул поставщика",
    OBYEM: "Тип изделия",
    KOLICHESTVO_POLYUSOV: "Количество полюсов",
    NOMINALNAYA_OTKLYUCHAYUSHCHAYA_SPOSOBNOST: "Отключающая способность",
    NOMINALNOE_NAPRYAZHENIE: "Номинальное напряжение",
    NOMINALNYY_TOK: "Номинальный ток",
    TIP_USTANOVKI: "Тип установки",
    TORGOVAYA_MARKA: "Торговая марка",
  };
  const ignored = new Set([
    "BRAND_PRIORITY",
    "CML2_ARTICLE",
    "CML2_BAR_CODE",
    "CML2_TAXES",
    "CML2_TRAITS",
    "IMYAKARTINKI",
    "KRATNOST_MIN",
    "RECOMMEND",
    "SPETSPREDLOZHENIE",
  ]);
  return Object.entries(record)
    .map(([key, itemValue]) => {
      if (ignored.has(key)) return null;
      const text = Array.isArray(itemValue)
        ? itemValue.map(toText).filter(Boolean).join("; ")
        : toText(itemValue);
      const name = labels[key] ?? key.toLocaleLowerCase("ru-RU").replaceAll("_", " ");
      return text ? { name, value: text } : null;
    })
    .filter((entry): entry is ProductCharacteristic => entry !== null)
    .slice(0, 30);
}

function normalizeStores(value: unknown): EktStoreStock[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const record = asRecord(entry);
      if (!record) return null;
      const name = toText(pick(record, ["name", "title", "storeName"]));
      if (!name) return null;
      return {
        id: toText(pick(record, ["id", "storeId"])),
        name,
        stock: toNumber(pick(record, ["quantity", "stock", "balance", "qty"])),
      };
    })
    .filter((entry): entry is EktStoreStock => entry !== null);
}

function normalizeRecommendedIds(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(
    new Set(entries.map(toText).filter((entry): entry is string => entry !== null)),
  ).slice(0, 10);
}

function certificatesFromProperties(value: unknown): ProductCertificate[] {
  const record = asRecord(value);
  if (!record) return [];
  const results: ProductCertificate[] = [];
  for (const [key, rawValue] of Object.entries(record)) {
    if (!/(CERT|SERTIF|PASSPORT|DECLAR|DOKUMENT)/i.test(key)) continue;
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const item of values) {
      const text = toText(item);
      if (!text) continue;
      results.push({
        name: key.toLocaleLowerCase("ru-RU").replaceAll("_", " "),
        url: toHttpUrl(text),
      });
    }
  }
  return results.slice(0, 10);
}

function normalizeCertificates(value: unknown): ProductCertificate[] {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return entries
    .map((entry, index) => {
      if (typeof entry === "string") {
        const url = /^https?:\/\//i.test(entry) ? entry : null;
        return { name: url ? `Сертификат ${index + 1}` : entry, url };
      }
      const record = asRecord(entry);
      if (!record) return null;
      const url = toHttpUrl(
        pick(record, ["url", "href", "link", "file", "uri", "downloadUrl"]),
      );
      const name =
        toText(pick(record, ["name", "title", "type", "description", "number"])) ??
        `Сертификат ${index + 1}`;
      return { name, url };
    })
    .filter((entry): entry is ProductCertificate => entry !== null)
    .slice(0, 10);
}

function findArrayPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const candidates = [
    "products",
    "items",
    "results",
    "data",
    "data.products",
    "data.items",
    "data.results",
    "content",
  ];
  for (const path of candidates) {
    const candidate = getByPath(payload, path);
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function normalizeProduct(raw: unknown): EktProduct | null {
  const record = asRecord(raw);
  if (!record) return null;

  const id = toText(pick(record, ["id", "productId", "product_id", "ID", "uid"]));
  const name = toText(
    pick(record, ["name", "title", "productName", "product_name", "NAME"]),
  );
  if (!id || !name) return null;

  const stockValue = pick(record, [
    "stock",
    "quantity",
    "qty",
    "balance",
    "residue",
    "rest",
    "stockQuantity",
    "availableQuantity",
    "availability.quantity",
    "availability.stock",
  ]);
  let stock = toNumber(stockValue);
  if (stock === null) {
    const warehouses = pick(record, ["stocks", "warehouses", "balances"]);
    if (Array.isArray(warehouses)) {
      const amounts = warehouses
        .map((item) =>
          toNumber(
            pick(item, ["quantity", "qty", "stock", "balance", "residue", "available"]),
          ),
        )
        .filter((item): item is number => item !== null);
      if (amounts.length > 0) stock = amounts.reduce((sum, item) => sum + item, 0);
    }
  }

  const explicitAvailability = toBoolean(
    pick(record, ["available", "inStock", "isAvailable", "availability.available", "status"]),
  );
  const available = stock !== null ? stock > 0 : explicitAvailability;
  const properties = pick(record, ["properties", "characteristics", "attributes"]);
  const explicitCertificates = normalizeCertificates(
    pick(record, ["certificates", "certificate", "documents.certificates", "docs", "documents"]),
  );

  return {
    id,
    sku: toText(
      pick(record, [
        "sku",
        "article",
        "articul",
        "vendorCode",
        "vendor_code",
        "code",
        "art",
        "ARTICLE",
      ]),
    ),
    name,
    category: toText(
      pick(record, ["category.name", "category.title", "category", "group.name", "groupName"]),
    ),
    price: toNumber(
      pick(record, ["price.value", "price.amount", "price", "salePrice", "retailPrice", "cost"]),
    ),
    currency: toText(
      pick(record, ["price.currency", "currency", "currencyCode", "priceCurrency"]),
    ),
    stock,
    available,
    characteristics: normalizeCharacteristics(
      pick(record, [
        "characteristics",
        "specifications",
        "properties",
        "attributes",
        "features",
        "params",
      ]),
    ),
    certificates:
      explicitCertificates.length > 0
        ? explicitCertificates
        : certificatesFromProperties(properties),
    brand: toText(
      pick(record, [
        "brand.name",
        "brand",
        "manufacturer.name",
        "manufacturer",
        "properties.TORGOVAYA_MARKA",
      ]),
    ),
    description: toText(pick(record, ["description", "shortDescription", "about"])),
    imageUrl: toHttpUrl(
      pick(record, ["image.url", "image", "imageUrl", "picture", "images.0.url", "images.0"]),
    ),
    productUrl: toHttpUrl(pick(record, ["url", "productUrl", "link"])),
    stores: normalizeStores(pick(record, ["stores", "warehouses", "stocks"])),
    recommendedProductIds: normalizeRecommendedIds(
      pick(record, ["recommendedProductIds", "recommendations", "properties.RECOMMEND"]),
    ),
  };
}

function readMetaNumber(payload: unknown, paths: string[]): number | null {
  return toNumber(pick(payload, paths));
}

async function request(path: string, searchParams?: URLSearchParams): Promise<unknown> {
  const { baseUrl, username, password } = getConfig();
  const url = new URL(`${baseUrl}${path}`);
  if (searchParams) searchParams.forEach((value, key) => url.searchParams.set(key, value));

  const configuredTimeout = Number(process.env.EKT_API_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const credentials = Buffer.from(`${username}:${password}`).toString("base64");
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${credentials}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new EktApiError(
        response.status === 401 || response.status === 403
          ? "EKT API отклонил учётные данные."
          : `EKT API вернул ошибку ${response.status}.`,
        response.status === 404 ? 404 : 502,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("json")) {
      throw new EktApiError("EKT API вернул ответ не в JSON-формате.");
    }
    return await response.json();
  } catch (error) {
    if (error instanceof EktApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new EktApiError(`EKT API не ответил за ${timeoutMs} мс.`, 504);
    }
    throw new EktApiError("Не удалось связаться с EKT API.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function getProducts(page = 1): Promise<ProductsPage> {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const cached = pageCache.get(safePage);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const configuredPerPage = Number(process.env.EKT_API_PER_PAGE);
  const perPage = Number.isInteger(configuredPerPage) && configuredPerPage > 0
    ? Math.min(configuredPerPage, 100)
    : DEFAULT_PER_PAGE;
  const payload = await request(
    "/products",
    new URLSearchParams({ page: String(safePage), per_page: String(perPage) }),
  );
  const rawProducts = findArrayPayload(payload);
  const products = rawProducts
    .map(normalizeProduct)
    .filter((product): product is EktProduct => product !== null);
  const totalPages = readMetaNumber(payload, [
    "totalPages",
    "pages",
    "pageCount",
    "meta.totalPages",
    "pagination.totalPages",
    "data.totalPages",
  ]);
  const total = readMetaNumber(payload, [
    "total",
    "totalCount",
    "meta.total",
    "pagination.total",
    "data.total",
  ]);
  const explicitHasNext = toBoolean(
    pick(payload, ["hasNext", "has_next", "meta.hasNext", "pagination.hasNext"]),
  );
  const responsePerPage =
    readMetaNumber(payload, ["per_page", "perPage", "meta.perPage", "pagination.perPage"]) ??
    perPage;

  const result: ProductsPage = {
    products,
    page: readMetaNumber(payload, ["page", "currentPage", "meta.page", "pagination.page"]) ?? safePage,
    totalPages,
    total,
    hasNextPage:
      totalPages !== null
        ? safePage < totalPages
        : explicitHasNext ?? (rawProducts.length < responsePerPage ? false : null),
    perPage: responsePerPage,
  };
  pageCache.set(safePage, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

export async function getProductDetail(id: string | number): Promise<EktProduct> {
  const normalizedId = String(id).trim();
  if (!normalizedId) throw new EktApiError("Не указан id товара.", 400);

  const payload = await request(
    "/products/detail",
    new URLSearchParams({ id: normalizedId }),
  );
  const selected =
    pick(payload, ["product", "item", "data.product", "data.item", "data"]) ?? payload;
  const raw = Array.isArray(selected) ? selected[0] : selected;
  const product = normalizeProduct(raw);
  if (!product) {
    throw new EktApiError("EKT API вернул карточку товара в неизвестном формате.");
  }
  return product;
}

function searchableText(product: EktProduct): string {
  return [product.id, product.sku, product.name, product.category, product.brand]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("ru-RU");
}

function scoreProduct(product: EktProduct, query: string): number {
  const normalizedQuery = query.toLocaleLowerCase("ru-RU").trim();
  const sku = product.sku?.toLocaleLowerCase("ru-RU") ?? "";
  const name = product.name.toLocaleLowerCase("ru-RU");
  const haystack = searchableText(product);
  const tokens = normalizedQuery.split(/\s+/).filter((token) => token.length > 1);
  let score = 0;

  if (product.id.toLocaleLowerCase("ru-RU") === normalizedQuery) score += 200;
  if (sku === normalizedQuery) score += 180;
  else if (sku.includes(normalizedQuery)) score += 90;
  if (name === normalizedQuery) score += 160;
  else if (name.includes(normalizedQuery)) score += 80;
  if (tokens.length > 0) {
    const matched = tokens.filter((token) => haystack.includes(token)).length;
    score += matched * 15;
    if (matched === tokens.length) score += 30;
  }
  if (product.available) score += 2;
  return score;
}

export async function searchProducts(query: string): Promise<EktProduct[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  if (/^\d+$/.test(normalizedQuery)) {
    try {
      const direct = await getProductDetail(normalizedQuery);
      if (scoreProduct(direct, normalizedQuery) > 0) return [direct];
    } catch (error) {
      if (!(error instanceof EktApiError) || error.status !== 404) throw error;
    }
  }

  const configuredMaxPages = Number(process.env.EKT_SEARCH_MAX_PAGES);
  const maxPages = Number.isInteger(configuredMaxPages) && configuredMaxPages > 0
    ? Math.min(configuredMaxPages, 100)
    : DEFAULT_MAX_SEARCH_PAGES;
  const collected: EktProduct[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const result = await getProducts(page);
    collected.push(...result.products);
    if (result.products.length === 0) break;
    if (result.hasNextPage === false) break;
    if (result.totalPages !== null && page >= result.totalPages) break;
  }

  return collected
    .map((product) => ({ product, score: scoreProduct(product, normalizedQuery) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map(({ product }) => product);
}
