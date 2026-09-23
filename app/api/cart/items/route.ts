import { NextRequest, NextResponse } from "next/server";

import { CartDomainError } from "@/lib/cart/service";
import { getCartId } from "@/lib/cart/session";
import { cartService } from "@/lib/cart/store";

export async function DELETE(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new CartDomainError("Некорректный JSON в запросе.", 400, "invalid_json");
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !("productId" in body) ||
      typeof body.productId !== "string" ||
      !body.productId.trim()
    ) {
      throw new CartDomainError("Не указан товар.", 400, "invalid_product_id");
    }

    const cartId = getCartId(request);
    if (!cartId) {
      throw new CartDomainError("Корзина не найдена.", 404, "cart_not_found");
    }

    const removal = cartService.removeItem(cartId, body.productId);
    return NextResponse.json({
      ok: true,
      message: "Товар удалён",
      ...removal,
    });
  } catch (error) {
    if (error instanceof CartDomainError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Не удалось удалить товар." },
      { status: 500 },
    );
  }
}
