import { NextRequest, NextResponse } from "next/server";

import { getCartId } from "@/lib/cart/session";
import { cartService } from "@/lib/cart/store";

export async function GET(request: NextRequest) {
  const cartId = getCartId(request);
  return NextResponse.json(
    cartId
      ? cartService.getCart(cartId)
      : { items: [], itemCount: 0, total: 0, currency: null },
  );
}
