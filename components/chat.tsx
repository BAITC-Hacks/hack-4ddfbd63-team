"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";

import { ProductCard } from "@/components/product-card";
import type { EktProduct } from "@/lib/ekt/types";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  products?: EktProduct[];
};

const starterMessages: Message[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "Здравствуйте! Найду товар EKT по названию или артикулу, проверю характеристики, цену и наличие.",
  },
];

const suggestions = [
  "Найди товар по артикулу",
  "Подбери автоматический выключатель",
  "Какие условия оплаты и доставки?",
];

export function Chat() {
  const [messages, setMessages] = useState<Message[]>(starterMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content || busy) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    queueMicrotask(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content: messageContent }) => ({
            role,
            content: messageContent,
          })),
        }),
      });
      const data = (await response.json()) as {
        message?: string;
        products?: EktProduct[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Не удалось получить ответ.");
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.message ?? "Нет ответа.",
          products: data.products,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            error instanceof Error
              ? `Не удалось выполнить запрос: ${error.message}`
              : "Не удалось выполнить запрос.",
        },
      ]);
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col bg-white shadow-[0_0_60px_rgba(16,35,31,0.08)] sm:min-h-[calc(100dvh-2rem)] sm:my-4 sm:rounded-[28px]">
      <header className="flex items-center justify-between border-b border-[#e2e9e6] px-4 py-4 sm:px-7">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-[#e6332a] text-sm font-black tracking-tight text-white">
            EKT
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight">AI-консультант</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[#65736f]">
              <span className="size-1.5 rounded-full bg-[#22a06b]" />
              Данные из каталога EKT
            </p>
          </div>
        </div>
        <Link
          className="rounded-xl border border-[#dbe4e1] px-3 py-2 text-sm font-bold text-[#263d37] transition hover:bg-[#f5f7f6]"
          href="/cart"
        >
          Корзина
        </Link>
      </header>

      <section className="flex-1 overflow-y-auto px-4 py-6 sm:px-7" aria-live="polite">
        <div className="mx-auto max-w-3xl space-y-5">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`min-w-0 ${message.role === "user" ? "max-w-[82%]" : "w-full"}`}>
                <div
                  className={
                    message.role === "user"
                      ? "ml-auto w-fit rounded-2xl rounded-br-md bg-[#10231f] px-4 py-3 text-sm leading-relaxed text-white"
                      : "w-fit max-w-[88%] rounded-2xl rounded-bl-md bg-[#f1f4f3] px-4 py-3 text-sm leading-relaxed text-[#263d37]"
                  }
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
                {message.products && message.products.length > 0 && (
                  <div className="mt-3 grid gap-3">
                    {message.products.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {messages.length === 1 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  className="rounded-full border border-[#dbe4e1] bg-white px-3 py-2 text-xs font-semibold text-[#425a53] hover:border-[#aebdb8] hover:bg-[#f8faf9]"
                  type="button"
                  onClick={() => void sendMessage(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {busy && (
            <div className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-md bg-[#f1f4f3] px-4 py-3 text-xs text-[#65736f]">
              <span className="size-2 animate-pulse rounded-full bg-[#e6332a]" />
              Проверяю каталог…
            </div>
          )}
          <div ref={endRef} />
        </div>
      </section>

      <footer className="border-t border-[#e2e9e6] p-3 sm:p-5">
        <form className="mx-auto flex max-w-3xl items-end gap-2" onSubmit={submit}>
          <textarea
            className="max-h-32 min-h-12 flex-1 resize-none rounded-2xl border border-[#ccd8d4] bg-[#fafcfb] px-4 py-3 text-sm outline-none transition placeholder:text-[#8b9793] focus:border-[#526b63] focus:bg-white"
            aria-label="Сообщение"
            placeholder="Название товара или артикул…"
            rows={1}
            value={input}
            disabled={busy}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e6332a] text-white transition hover:bg-[#bd241d] disabled:cursor-not-allowed disabled:bg-[#d8a09d]"
            type="submit"
            aria-label="Отправить"
            disabled={busy || !input.trim()}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2">
              <path d="m5 12 14-7-4 14-3-6-7-1Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
        <p className="mt-2 text-center text-[10px] text-[#87938f]">
          Актуальные товарные данные запрашиваются у EKT API
        </p>
      </footer>
    </main>
  );
}

