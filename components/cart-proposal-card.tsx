"use client";

import Link from "next/link";
import { useState } from "react";

import type { CartProposal } from "@/lib/cart/types";

type CartApiResponse = {
  ok?: boolean;
  error?: string;
};

async function readCartApiResponse(response: Response): Promise<CartApiResponse> {
  const rawBody = await response.text();
  if (!rawBody.trim()) {
    throw new Error(
      response.ok
        ? "Сервер вернул пустой ответ."
        : `Сервер вернул пустой ответ (HTTP ${response.status}).`,
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(rawBody);
  } catch {
    throw new Error(`Сервер вернул некорректный JSON (HTTP ${response.status}).`);
  }

  if (typeof data !== "object" || data === null) {
    throw new Error(`Сервер вернул некорректный ответ (HTTP ${response.status}).`);
  }
  return data as CartApiResponse;
}

function formatMoney(value: number | null): string {
  return value === null
    ? "Цена не указана"
    : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
}

export function CartProposalCard({ proposal }: { proposal: CartProposal }) {
  const [state, setState] = useState<"pending" | "confirmed" | "cancelled">("pending");
  const [quantity, setQuantity] = useState(String(proposal.requestedQuantity));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    const parsedQuantity = Number(quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setError("Количество должно быть целым числом больше нуля.");
      return;
    }
    if (proposal.actualStock !== null && parsedQuantity > proposal.actualStock) {
      setError(`Доступно только ${proposal.actualStock} шт.`);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/cart/proposals/${encodeURIComponent(proposal.proposalId)}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: parsedQuantity }),
        },
      );
      const data = await readCartApiResponse(response);
      if (!response.ok || data.ok !== true) {
        throw new Error(data.error ?? `Не удалось добавить товар (HTTP ${response.status}).`);
      }
      setState("confirmed");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка подтверждения.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/cart/proposals/${encodeURIComponent(proposal.proposalId)}`,
        { method: "DELETE" },
      );
      const data = await readCartApiResponse(response);
      if (!response.ok || data.ok !== true) {
        throw new Error(data.error ?? `Не удалось отменить предложение (HTTP ${response.status}).`);
      }
      setState("cancelled");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка отмены.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "confirmed") {
    return (
      <div className="rounded-xl border border-[#b9ddce] bg-[#eaf7f1] p-3 text-sm">
        <p className="font-bold text-[#176a48]">Товар добавлен ✓</p>
        <Link
          className="mt-2 inline-block rounded-lg bg-[#176a48] px-3 py-2 font-bold text-white"
          href="/cart"
        >
          Перейти в корзину
        </Link>
      </div>
    );
  }

  if (state === "cancelled") {
    return (
      <div className="rounded-xl bg-[#f1f4f3] p-3 text-sm font-semibold text-[#65736f]">
        Добавление отменено
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-[#f0cbc8] bg-[#fff5f4] p-3">
      <p className="text-sm font-bold text-[#10231f]">
        Добавить {proposal.requestedQuantity} шт. «{proposal.productName}»?
      </p>
      <label className="mt-3 block text-xs font-semibold text-[#52625d]">
        Количество
        <input
          aria-label="Количество для добавления"
          className="mt-1 block h-9 w-24 rounded-lg border border-[#ccd8d4] bg-white px-3 text-sm text-[#10231f] outline-none focus:border-[#e6332a]"
          type="number"
          min={1}
          max={proposal.actualStock ?? undefined}
          step={1}
          value={quantity}
          disabled={busy}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </label>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-[#65736f]">
        <div>
          <dt>Актуальный остаток</dt>
          <dd className="font-bold text-[#263d37]">
            {proposal.actualStock === null ? "Не указан" : `${proposal.actualStock} шт.`}
          </dd>
        </div>
        <div>
          <dt>Сумма предложения</dt>
          <dd className="font-bold text-[#263d37]">{formatMoney(proposal.total)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-[11px] text-[#7c8884]">
        При подтверждении цена и остаток будут повторно запрошены у EKT.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="rounded-lg border border-[#d7dfdc] bg-white px-4 py-2 text-sm font-bold text-[#52625d] disabled:opacity-60"
          type="button"
          disabled={busy}
          onClick={cancel}
        >
          Отмена
        </button>
        <button
          className="rounded-lg bg-[#e6332a] px-4 py-2 text-sm font-bold text-white hover:bg-[#bd241d] disabled:opacity-60"
          type="button"
          disabled={busy}
          onClick={confirm}
        >
          {busy ? "Проверяем…" : "Да, добавить"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-[#bd241d]">{error}</p>}
    </section>
  );
}
