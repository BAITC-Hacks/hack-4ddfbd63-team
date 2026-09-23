// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CartPage from "@/app/cart/page";
import type { CartSummary } from "@/lib/cart/types";
import type { EktProduct } from "@/lib/ekt/types";

const firstProduct: EktProduct = {
  id: "515291",
  sku: "200300285_",
  name: "Первый товар",
  category: null,
  price: 100,
  currency: null,
  stock: 23,
  available: true,
  characteristics: [],
  certificates: [],
  brand: "EKT",
  description: null,
  imageUrl: null,
  productUrl: null,
  stores: [],
  recommendedProductIds: [],
};

const secondProduct: EktProduct = {
  ...firstProduct,
  id: "second",
  sku: "second-sku",
  name: "Второй товар",
  price: 50,
};

const initialCart: CartSummary = {
  items: [{ product: firstProduct, quantity: 2, addedAt: "2026-09-23T12:00:00.000Z" }],
  itemCount: 2,
  total: 200,
  currency: null,
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function button(label: string): HTMLButtonElement {
  const result = Array.from(document.querySelectorAll("button")).find(
    (element) => element.textContent?.trim() === label,
  );
  if (!(result instanceof HTMLButtonElement)) throw new Error(`Button not found: ${label}`);
  return result;
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("cart removal confirmation", () => {
  let root: Root;

  beforeEach(async () => {
    document.body.innerHTML = '<div id="root"></div>';
    root = createRoot(document.querySelector("#root")!);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  async function renderWith(fetchMock: ReturnType<typeof vi.fn>) {
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<CartPage />));
    await flush();
  }

  it("открытие confirmation не меняет корзину и не вызывает DELETE", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(initialCart));
    await renderWith(fetchMock);

    await act(async () => button("Удалить").click());

    expect(document.body.textContent).toContain("Удалить товар из корзины?");
    expect(document.body.textContent).toContain("Первый товар");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cancel закрывает confirmation и не меняет корзину", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(initialCart));
    await renderWith(fetchMock);
    await act(async () => button("Удалить").click());

    await act(async () => button("Отмена").click());

    expect(document.body.textContent).not.toContain("Удалить товар из корзины?");
    expect(document.body.textContent).toContain("Первый товар");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("explicit confirm вызывает DELETE и сразу показывает empty state", async () => {
    const emptyCart: CartSummary = { items: [], itemCount: 0, total: 0, currency: null };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(initialCart))
      .mockResolvedValueOnce(
        response({ ok: true, message: "Товар удалён", removedProductId: "515291", cart: emptyCart }),
      );
    await renderWith(fetchMock);
    await act(async () => button("Удалить").click());

    await act(async () => button("Да, удалить").click());
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/cart/items",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ productId: "515291" }),
      }),
    );
    expect(document.body.textContent).toContain("Товар удалён");
    expect(document.body.textContent).toContain("Корзина пуста");
    expect(document.body.textContent).toContain("Вернуться к консультанту");
  });

  it("после удаления показывает пересчитанный total без refresh", async () => {
    const twoItems: CartSummary = {
      items: [
        { product: firstProduct, quantity: 2, addedAt: "2026-09-23T12:00:00.000Z" },
        { product: secondProduct, quantity: 3, addedAt: "2026-09-23T12:00:00.000Z" },
      ],
      itemCount: 5,
      total: 350,
      currency: null,
    };
    const remaining: CartSummary = {
      items: [{ product: secondProduct, quantity: 3, addedAt: "2026-09-23T12:00:00.000Z" }],
      itemCount: 3,
      total: 150,
      currency: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(twoItems))
      .mockResolvedValueOnce(
        response({ ok: true, message: "Товар удалён", removedProductId: "515291", cart: remaining }),
      );
    await renderWith(fetchMock);
    await act(async () => button("Удалить").click());

    await act(async () => button("Да, удалить").click());
    await flush();

    expect(document.body.textContent).not.toContain("Первый товар");
    expect(document.body.textContent).toContain("Второй товар");
    expect(document.body.textContent).toContain("Всего товаров: 3");
    expect(document.body.textContent).toContain("Итого: 150");
  });
});
