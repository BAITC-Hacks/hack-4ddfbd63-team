import { NextRequest, NextResponse } from "next/server";

import { CartDomainError } from "@/lib/cart/service";
import { getCartId } from "@/lib/cart/session";
import { cartService } from "@/lib/cart/store";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ proposalId: string }> },
) {
  try {
    const cartId = getCartId(request);
    if (!cartId) throw new CartDomainError("Предложение не найдено.", 404, "proposal_not_found");
    const { proposalId } = await params;
    const proposal = cartService.cancelProposal(cartId, proposalId);
    return NextResponse.json({ ok: true, proposal });
  } catch (error) {
    if (error instanceof CartDomainError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Не удалось отменить предложение." },
      { status: 500 },
    );
  }
}
