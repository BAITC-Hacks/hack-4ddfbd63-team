import { NextRequest, NextResponse } from "next/server";

import { CartDomainError } from "@/lib/cart/service";
import { getOrCreateCartId, setCartCookie } from "@/lib/cart/session";
import { cartService } from "@/lib/cart/store";
import { EktApiError } from "@/lib/ekt/adapter";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { productId?: unknown; quantity?: unknown };
    const productId = typeof body.productId === "string" ? body.productId : "";
    const quantity = Number(body.quantity);
    const { cartId, isNew } = getOrCreateCartId(request);
    const proposal = await cartService.createProposal(cartId, productId, quantity);
    const response = NextResponse.json({ ok: true, proposal }, { status: 201 });
    if (isNew) setCartCookie(response, cartId);
    return response;
  } catch (error) {
    if (error instanceof CartDomainError || error instanceof EktApiError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          code: error instanceof CartDomainError ? error.code : "ekt_error",
        },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Не удалось создать предложение." },
      { status: 500 },
    );
  }
}
