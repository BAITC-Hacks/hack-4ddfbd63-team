import { describe, expect, it, vi } from "vitest";

import { CartDomainError, CartService } from "@/lib/cart/service";
import type { EktProduct } from "@/lib/ekt/types";

function product(overrides: Partial<EktProduct> = {}): EktProduct {
  return {
    id: "515291",
    sku: "200300285_",
    name: "Автоматический выключатель",
    category: null,
    price: 100,
    currency: null,
    stock: 10,
    available: true,
    characteristics: [],
    certificates: [],
    brand: "EKT",
    description: null,
    imageUrl: null,
    productUrl: null,
    stores: [],
    recommendedProductIds: [],
    ...overrides,
  };
}

function serviceWithProducts(...products: EktProduct[]) {
  let index = 0;
  const getProductDetail = vi.fn(async () => products[Math.min(index++, products.length - 1)]);
  let id = 0;
  const service = new CartService({
    getProductDetail,
    createId: () => `proposal-${++id}`,
    now: () => new Date("2026-09-23T12:00:00.000Z"),
  });
  return { service, getProductDetail };
}

describe("safe prototype cart", () => {
  it("обычный вопрос не меняет корзину, когда cart tool не вызван", () => {
    const { service, getProductDetail } = serviceWithProducts(product());

    expect(service.getCart("session")).toEqual({
      items: [],
      itemCount: 0,
      total: 0,
      currency: null,
    });
    expect(getProductDetail).not.toHaveBeenCalled();
  });

  it("запрос «добавь 5» создаёт proposal, но не меняет корзину", async () => {
    const { service } = serviceWithProducts(product());

    await service.createProposal("session", "515291", 5);

    expect(service.getCart("session").items).toHaveLength(0);
  });

  it("CartProposal содержит только серверные товарные данные", async () => {
    const { service } = serviceWithProducts(product({ price: 125, stock: 9 }));

    const proposal = await service.createProposal("session", "515291", 5);

    expect(proposal).toEqual({
      proposalId: "proposal-1",
      productId: "515291",
      productName: "Автоматический выключатель",
      requestedQuantity: 5,
      actualStock: 9,
      unitPrice: 125,
      total: 625,
      expiresAt: "2026-09-23T12:05:00.000Z",
    });
  });

  it("confirmation повторно получает товар и меняет корзину", async () => {
    const initial = product({ price: 100, stock: 10 });
    const current = product({ price: 110, stock: 8 });
    const { service, getProductDetail } = serviceWithProducts(initial, current);
    const proposal = await service.createProposal("session", "515291", 5);

    const confirmation = await service.confirmProposal("session", proposal.proposalId, 5);

    expect(getProductDetail).toHaveBeenCalledTimes(2);
    expect(confirmation.item.quantity).toBe(5);
    expect(confirmation.item.product.price).toBe(110);
    expect(confirmation.cart.total).toBe(550);
    expect(confirmation.alreadyConfirmed).toBe(false);
  });

  it("quantity больше актуального stock отклоняется", async () => {
    const { service } = serviceWithProducts(product({ stock: 20 }), product({ stock: 4 }));
    const proposal = await service.createProposal("session", "515291", 5);

    await expect(service.confirmProposal("session", proposal.proposalId)).rejects.toMatchObject({
      code: "quantity_exceeds_stock",
      status: 409,
    } satisfies Partial<CartDomainError>);
    expect(service.getCart("session").items).toHaveLength(0);
  });

  it("изменённое в confirmation quantity повторно проверяется и сохраняется", async () => {
    const { service, getProductDetail } = serviceWithProducts(
      product({ stock: 23 }),
      product({ stock: 23 }),
    );
    const proposal = await service.createProposal("session", "515291", 5);

    const confirmation = await service.confirmProposal("session", proposal.proposalId, 7);

    expect(getProductDetail).toHaveBeenCalledTimes(2);
    expect(confirmation.proposal.requestedQuantity).toBe(7);
    expect(confirmation.item.quantity).toBe(7);
    expect(service.getCart("session").itemCount).toBe(7);
  });

  it("quantity больше 23 отклоняется сервером при confirmation", async () => {
    const { service } = serviceWithProducts(product({ stock: 23 }), product({ stock: 23 }));
    const proposal = await service.createProposal("session", "515291", 5);

    await expect(service.confirmProposal("session", proposal.proposalId, 24)).rejects.toMatchObject({
      code: "quantity_exceeds_stock",
      status: 409,
    } satisfies Partial<CartDomainError>);
    expect(service.getCart("session").items).toHaveLength(0);
  });

  it.each([0, -1, 1.5])(
    "confirmation quantity=%s отклоняется без изменения корзины",
    async (quantity) => {
      const { service, getProductDetail } = serviceWithProducts(product({ stock: 23 }));
      const proposal = await service.createProposal("session", "515291", 5);

      await expect(
        service.confirmProposal("session", proposal.proposalId, quantity),
      ).rejects.toMatchObject({
        code: "invalid_quantity",
        status: 400,
      } satisfies Partial<CartDomainError>);
      expect(service.getCart("session").items).toHaveLength(0);
      expect(getProductDetail).toHaveBeenCalledTimes(1);
    },
  );

  it.each([0, -1, 1.5])("quantity=%s отклоняется", async (quantity) => {
    const { service } = serviceWithProducts(product());

    await expect(service.createProposal("session", "515291", quantity)).rejects.toMatchObject({
      code: "invalid_quantity",
      status: 400,
    } satisfies Partial<CartDomainError>);
    expect(service.getCart("session").items).toHaveLength(0);
  });

  it("повторное confirmation идемпотентно и не удваивает количество", async () => {
    const { service, getProductDetail } = serviceWithProducts(product(), product());
    const proposal = await service.createProposal("session", "515291", 3);
    const first = await service.confirmProposal("session", proposal.proposalId);
    const repeated = await service.confirmProposal("session", proposal.proposalId);

    expect(first.alreadyConfirmed).toBe(false);
    expect(repeated.alreadyConfirmed).toBe(true);
    expect(repeated.item.quantity).toBe(3);
    expect(service.getCart("session").itemCount).toBe(3);
    expect(getProductDetail).toHaveBeenCalledTimes(2);
  });
});
