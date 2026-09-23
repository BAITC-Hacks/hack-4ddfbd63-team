"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { CartSummary } from "@/lib/cart/types";

function formatPrice(price: number | null, currency: string | null, quantity: number) {
  if (price === null) return "Цена не указана";
  const total = price * quantity;
  if (!currency) return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(total);
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(total);
  } catch {
    return `${new Intl.NumberFormat("ru-RU").format(total)} ${currency}`;
  }
}

export default function CartPage() {
  const [cart, setCart] = useState<CartSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/cart")
      .then(async (response) => {
        const data = (await response.json()) as CartSummary & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Не удалось загрузить корзину.");
        setCart(data);
      })
      .catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : "Ошибка загрузки.");
        setCart({ items: [], itemCount: 0, total: 0, currency: null });
      });
  }, []);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-4xl bg-white px-4 py-6 shadow-[0_0_60px_rgba(16,35,31,0.08)] sm:my-4 sm:min-h-[calc(100dvh-2rem)] sm:rounded-[28px] sm:px-8 sm:py-8">
      <div className="flex items-center justify-between border-b border-[#e2e9e6] pb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#e6332a]">EKT AI</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Корзина</h1>
        </div>
        <Link
          className="rounded-xl border border-[#dbe4e1] px-4 py-2 text-sm font-bold hover:bg-[#f5f7f6]"
          href="/"
        >
          Вернуться в чат
        </Link>
      </div>

      {cart === null ? (
        <p className="py-12 text-sm text-[#65736f]">Загружаем корзину…</p>
      ) : cart.items.length === 0 ? (
        <div className="py-20 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#f1f4f3] text-2xl">⌁</div>
          <h2 className="mt-4 text-lg font-bold">Корзина пуста</h2>
          <p className="mt-2 text-sm text-[#65736f]">
            Найдите товар в чате и подтвердите добавление.
          </p>
          <Link
            className="mt-5 inline-block rounded-xl bg-[#e6332a] px-5 py-3 text-sm font-bold text-white hover:bg-[#bd241d]"
            href="/"
          >
            Найти товар
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-[#e8eeeb]">
          {cart.items.map(({ product, quantity }) => (
            <article key={product.id} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <h2 className="font-bold leading-snug">{product.name}</h2>
                <p className="mt-1 text-xs text-[#65736f]">
                  {product.sku ? `Артикул: ${product.sku}` : `ID: ${product.id}`}
                </p>
              </div>
              <div className="flex items-center justify-between gap-8 sm:justify-end">
                <span className="rounded-lg bg-[#f1f4f3] px-3 py-2 text-sm font-semibold">
                  {quantity} шт.
                </span>
                <span className="min-w-28 text-right font-extrabold">
                  {formatPrice(product.price, product.currency, quantity)}
                </span>
              </div>
            </article>
          ))}
          <div className="flex items-center justify-between border-t-2 border-[#dbe4e1] py-5">
            <span className="text-sm font-bold text-[#65736f]">
              Всего товаров: {cart.itemCount}
            </span>
            <span className="text-xl font-extrabold">
              Итого: {formatPrice(cart.total, cart.currency, 1)}
            </span>
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm font-semibold text-[#bd241d]">{error}</p>}
      <p className="mt-8 rounded-xl bg-[#f5f7f6] p-3 text-xs leading-relaxed text-[#65736f]">
        Корзина MVP хранится на сервере в памяти и очищается при перезапуске приложения. Перед каждым
        добавлением остаток повторно проверяется через EKT API.
      </p>
    </main>
  );
}
