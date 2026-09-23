import "server-only";

import { CartService } from "@/lib/cart/service";
import { getProductDetail } from "@/lib/ekt/adapter";

const globalWithCart = globalThis as typeof globalThis & {
  __ektCartService?: CartService;
};

export const cartService =
  globalWithCart.__ektCartService ?? new CartService({ getProductDetail });

if (process.env.NODE_ENV !== "production") {
  globalWithCart.__ektCartService = cartService;
}
