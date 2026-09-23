import "server-only";

import { randomUUID } from "node:crypto";

import type { NextRequest, NextResponse } from "next/server";

export const CART_COOKIE = "ekt_cart_id";

export function getCartId(request: NextRequest): string | null {
  const value = request.cookies.get(CART_COOKIE)?.value;
  return value && /^[a-f0-9-]{36}$/i.test(value) ? value : null;
}

export function getOrCreateCartId(request: NextRequest): {
  cartId: string;
  isNew: boolean;
} {
  const existing = getCartId(request);
  return existing ? { cartId: existing, isNew: false } : { cartId: randomUUID(), isNew: true };
}

export function setCartCookie(response: NextResponse, cartId: string) {
  response.cookies.set(CART_COOKIE, cartId, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
}
