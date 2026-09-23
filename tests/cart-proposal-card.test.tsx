import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CartProposalCard } from "@/components/cart-proposal-card";

describe("CartProposalCard", () => {
  it("берёт начальное quantity из CartProposal.requestedQuantity", () => {
    const html = renderToStaticMarkup(
      <CartProposalCard
        proposal={{
          proposalId: "proposal-1",
          productId: "515291",
          productName: "Тестовый товар",
          requestedQuantity: 5,
          actualStock: 23,
          unitPrice: 100,
          total: 500,
          expiresAt: "2026-09-23T12:05:00.000Z",
        }}
      />,
    );

    expect(html).toContain('aria-label="Количество для добавления"');
    expect(html).toContain('value="5"');
  });
});
