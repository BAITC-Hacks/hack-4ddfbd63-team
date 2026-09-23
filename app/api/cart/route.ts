import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getCart, setCartItem } from "@/lib/cart/store";
import { EktApiError, getProductDetail } from "@/lib/ekt/adapter";

const CART_COOKIE = "ekt_cart_id";

function cartIdFromRequest(request: NextRequest): string | null {
  const value = request.cookies.get(CART_COOKIE)?.value;
  return value && /^[a-f0-9-]{36}$/i.test(value) ? value : null;
}

export async function GET(request: NextRequest) {
  const cartId = cartIdFromRequest(request);
  return NextResponse.json({ items: cartId ? getCart(cartId) : [] });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { productId?: unknown; quantity?: unknown };
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    const quantity = Number(body.quantity);

    if (!productId || !Number.isInteger(quantity) || quantity < 1) {
      return NextResponse.json(
        { error: "Укажите товар и целое количество не меньше 1." },
        { status: 400 },
      );
    }

    // The detail request is deliberately repeated at confirmation time. The stock
    // shown in chat is informational and is never trusted for a cart mutation.
    const product = await getProductDetail(productId);
    if (product.stock === null) {
      return NextResponse.json(
        { error: "EKT API не вернул точный остаток. Добавление отменено." },
        { status: 409 },
      );
    }
    if (product.stock < 1 || product.available === false) {
      return NextResponse.json(
        { error: "Товар закончился. Остаток был повторно проверен." },
        { status: 409 },
      );
    }
    if (quantity > product.stock) {
      return NextResponse.json(
        { error: `Доступно только ${product.stock} шт.` },
        { status: 409 },
      );
    }

    const cartId = cartIdFromRequest(request) ?? randomUUID();
    const items = setCartItem(cartId, product, quantity);
    const response = NextResponse.json({
      ok: true,
      item: { product, quantity },
      itemCount: items.reduce((total, item) => total + item.quantity, 0),
      cartUrl: "/cart",
    });
    response.cookies.set(CART_COOKIE, cartId, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
    return response;
  } catch (error) {
    if (error instanceof EktApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Не удалось обновить корзину." }, { status: 500 });
  }
}

