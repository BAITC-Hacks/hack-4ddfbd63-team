"use client";

import Link from "next/link";
import { useState } from "react";

import type { EktProduct } from "@/lib/ekt/types";

function formatPrice(price: number | null, currency: string | null): string {
  if (price === null) return "Цена не указана";
  if (currency) {
    try {
      return new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(price);
    } catch {
      return `${new Intl.NumberFormat("ru-RU").format(price)} ${currency}`;
    }
  }
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(price);
}

function stockLabel(product: EktProduct): string {
  if (product.stock !== null) {
    return product.stock > 0 ? `В наличии: ${product.stock} шт.` : "Нет в наличии";
  }
  if (product.available === true) return "В наличии, точный остаток не указан";
  if (product.available === false) return "Нет в наличии";
  return "Наличие не указано";
}

export function ProductCard({ product }: { product: EktProduct }) {
  const [confirming, setConfirming] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(false);
  const canAttemptAdd = product.available !== false && product.stock !== 0;

  async function confirmAdd() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, quantity }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось добавить товар.");
      setAdded(true);
      setConfirming(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка добавления.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl border border-[#dbe4e1] bg-white p-4 shadow-[0_8px_30px_rgba(16,35,31,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {product.category && (
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#76837f]">
              {product.category}
            </p>
          )}
          <h3 className="text-[15px] font-bold leading-snug text-[#10231f]">{product.name}</h3>
          <p className="mt-1 text-xs text-[#65736f]">
            {product.sku ? `Артикул: ${product.sku}` : `ID: ${product.id}`}
          </p>
        </div>
        <p className="whitespace-nowrap text-base font-extrabold text-[#10231f]">
          {formatPrice(product.price, product.currency)}
        </p>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs font-semibold">
        <span
          className={`inline-block size-2 rounded-full ${product.available === false || product.stock === 0 ? "bg-[#e6332a]" : "bg-[#22a06b]"}`}
        />
        <span>{stockLabel(product)}</span>
      </div>

      {product.characteristics.length > 0 && (
        <dl className="mt-4 grid grid-cols-1 gap-2 border-t border-[#edf1ef] pt-3 sm:grid-cols-2">
          {product.characteristics.slice(0, 6).map((item) => (
            <div key={`${item.name}-${item.value}`} className="min-w-0 text-xs">
              <dt className="text-[#77847f]">{item.name}</dt>
              <dd className="mt-0.5 font-semibold text-[#263d37]">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {product.certificates.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {product.certificates.map((certificate) =>
            certificate.url ? (
              <a
                key={`${certificate.name}-${certificate.url}`}
                className="rounded-full bg-[#edf5f2] px-3 py-1.5 text-xs font-semibold text-[#27604e] hover:bg-[#dcece6]"
                href={certificate.url}
                target="_blank"
                rel="noreferrer"
              >
                {certificate.name}
              </a>
            ) : (
              <span
                key={certificate.name}
                className="rounded-full bg-[#f1f3f2] px-3 py-1.5 text-xs text-[#65736f]"
              >
                {certificate.name}
              </span>
            ),
          )}
        </div>
      )}

      {product.productUrl && (
        <a
          className="mt-3 inline-block text-xs font-bold text-[#27604e] underline decoration-[#a8c6bb] underline-offset-2"
          href={product.productUrl}
          target="_blank"
          rel="noreferrer"
        >
          Открыть товар на сайте EKT
        </a>
      )}

      <div className="mt-4 border-t border-[#edf1ef] pt-3">
        {added ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-[#eaf7f1] px-3 py-2 text-sm">
            <span className="font-semibold text-[#176a48]">Товар добавлен после проверки остатка</span>
            <Link className="font-bold text-[#176a48] underline" href="/cart">
              В корзину
            </Link>
          </div>
        ) : confirming ? (
          <div className="rounded-xl bg-[#fff5f4] p-3">
            <p className="text-sm font-semibold">Подтвердите добавление в корзину</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                aria-label="Количество"
                className="h-9 w-20 rounded-lg border border-[#ccd8d4] bg-white px-3 text-sm outline-none focus:border-[#e6332a]"
                type="number"
                min={1}
                max={product.stock === null ? undefined : Math.max(1, Math.floor(product.stock))}
                value={quantity}
                onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
              />
              <button
                className="h-9 rounded-lg bg-[#e6332a] px-4 text-sm font-bold text-white hover:bg-[#bd241d] disabled:opacity-60"
                type="button"
                disabled={busy}
                onClick={confirmAdd}
              >
                {busy ? "Проверяем остаток…" : "Да, добавить"}
              </button>
              <button
                className="h-9 px-2 text-sm font-semibold text-[#65736f]"
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <button
            className="rounded-xl bg-[#10231f] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#29453d] disabled:cursor-not-allowed disabled:bg-[#b6bfbc]"
            type="button"
            disabled={!canAttemptAdd}
            onClick={() => setConfirming(true)}
          >
            {canAttemptAdd ? "Добавить в корзину" : "Недоступно"}
          </button>
        )}
        {error && <p className="mt-2 text-xs font-semibold text-[#bd241d]">{error}</p>}
      </div>
    </article>
  );
}
