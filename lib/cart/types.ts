import type { EktProduct } from "@/lib/ekt/types";

export type CartItem = {
  product: EktProduct;
  quantity: number;
  addedAt: string;
};

export type CartProposal = {
  proposalId: string;
  productId: string;
  productName: string;
  requestedQuantity: number;
  actualStock: number | null;
  unitPrice: number | null;
  total: number | null;
  expiresAt: string;
};

export type CartSummary = {
  items: CartItem[];
  itemCount: number;
  total: number | null;
  currency: string | null;
};

export type CartConfirmation = {
  proposal: CartProposal;
  item: CartItem;
  cart: CartSummary;
  alreadyConfirmed: boolean;
};
