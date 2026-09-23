import "server-only";

import type { CartItem } from "@/lib/cart/types";
import type { EktProduct } from "@/lib/ekt/types";

type CartStore = Map<string, Map<string, CartItem>>;

const globalWithCart = globalThis as typeof globalThis & {
  __ektCartStore?: CartStore;
};

const carts = globalWithCart.__ektCartStore ?? new Map<string, Map<string, CartItem>>();

if (process.env.NODE_ENV !== "production") {
  globalWithCart.__ektCartStore = carts;
}

export function getCart(cartId: string): CartItem[] {
  return Array.from(carts.get(cartId)?.values() ?? []);
}

export function setCartItem(cartId: string, product: EktProduct, quantity: number): CartItem[] {
  const cart = carts.get(cartId) ?? new Map<string, CartItem>();
  cart.set(product.id, {
    product,
    quantity,
    addedAt: new Date().toISOString(),
  });
  carts.set(cartId, cart);
  return Array.from(cart.values());
}
