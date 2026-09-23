import { NextRequest, NextResponse } from "next/server";

import { CartDomainError } from "@/lib/cart/service";
import { getCartId } from "@/lib/cart/session";
import { cartService } from "@/lib/cart/store";
import { EktApiError } from "@/lib/ekt/adapter";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ proposalId: string }> },
) {
  try {
    const cartId = getCartId(request);
    if (!cartId) throw new CartDomainError("Предложение не найдено.", 404, "proposal_not_found");
    const { proposalId } = await params;
    const rawBody = await request.text();
    let quantity: number | undefined;

    if (rawBody.trim()) {
      let body: unknown;
      try {
        body = JSON.parse(rawBody);
      } catch {
        throw new CartDomainError("Некорректный JSON в запросе.", 400, "invalid_json");
      }

      if (typeof body !== "object" || body === null || !("quantity" in body)) {
        throw new CartDomainError("Не указано количество.", 400, "invalid_quantity");
      }
      quantity = Number(body.quantity);
    }

    const confirmation = await cartService.confirmProposal(cartId, proposalId, quantity);
    return NextResponse.json({
      ok: true,
      message: "Товар добавлен в корзину.",
      ...confirmation,
      cartUrl: "/cart",
    });
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
      { ok: false, error: "Не удалось подтвердить добавление." },
      { status: 500 },
    );
  }
}
