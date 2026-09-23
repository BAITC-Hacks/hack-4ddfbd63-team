import type { EktProduct } from "@/lib/ekt/types";

export type CartItem = {
  product: EktProduct;
  quantity: number;
  addedAt: string;
};
