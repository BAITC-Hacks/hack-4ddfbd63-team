import type {
  CartConfirmation,
  CartItem,
  CartProposal,
  CartRemoval,
  CartSummary,
} from "@/lib/cart/types";
import type { EktProduct } from "@/lib/ekt/types";

const DEFAULT_PROPOSAL_TTL_MS = 5 * 60 * 1_000;

type ProposalStatus = "pending" | "processing" | "confirmed" | "cancelled";

type StoredProposal = CartProposal & {
  cartId: string;
  status: ProposalStatus;
  confirmedAt: string | null;
  confirmedItem: CartItem | null;
};

export type CartServiceDependencies = {
  getProductDetail: (id: string) => Promise<EktProduct>;
  createId?: () => string;
  now?: () => Date;
  proposalTtlMs?: number;
};

export class CartDomainError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "CartDomainError";
  }
}

function publicProposal(proposal: StoredProposal): CartProposal {
  return {
    proposalId: proposal.proposalId,
    productId: proposal.productId,
    productName: proposal.productName,
    requestedQuantity: proposal.requestedQuantity,
    actualStock: proposal.actualStock,
    unitPrice: proposal.unitPrice,
    total: proposal.total,
    expiresAt: proposal.expiresAt,
  };
}

export class CartService {
  private readonly carts = new Map<string, Map<string, CartItem>>();
  private readonly proposals = new Map<string, StoredProposal>();
  private readonly createId: () => string;
  private readonly now: () => Date;
  private readonly proposalTtlMs: number;

  constructor(private readonly dependencies: CartServiceDependencies) {
    this.createId = dependencies.createId ?? (() => crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date());
    this.proposalTtlMs = dependencies.proposalTtlMs ?? DEFAULT_PROPOSAL_TTL_MS;
  }

  getCart(cartId: string): CartSummary {
    const items = Array.from(this.carts.get(cartId)?.values() ?? []);
    const pricedItems = items.filter((item) => item.product.price !== null);
    const currencies = new Set(
      pricedItems.map((item) => item.product.currency).filter((value) => value !== null),
    );
    const hasUnknownPrice = pricedItems.length !== items.length;

    return {
      items,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      total: hasUnknownPrice
        ? null
        : items.reduce((sum, item) => sum + (item.product.price ?? 0) * item.quantity, 0),
      currency: currencies.size === 1 ? Array.from(currencies)[0] : null,
    };
  }

  removeItem(cartId: string, productId: string): CartRemoval {
    const normalizedProductId = productId.trim();
    if (!normalizedProductId) {
      throw new CartDomainError("Не указан товар.", 400, "invalid_product_id");
    }

    const cart = this.carts.get(cartId);
    if (!cart?.has(normalizedProductId)) {
      throw new CartDomainError(
        "Товар в корзине не найден или уже удалён.",
        404,
        "cart_item_not_found",
      );
    }

    cart.delete(normalizedProductId);
    if (cart.size === 0) this.carts.delete(cartId);

    return {
      removedProductId: normalizedProductId,
      cart: this.getCart(cartId),
    };
  }

  async createProposal(
    cartId: string,
    productId: string,
    requestedQuantity: number,
  ): Promise<CartProposal> {
    const normalizedProductId = productId.trim();
    if (!normalizedProductId) {
      throw new CartDomainError("Не указан товар.", 400, "invalid_product_id");
    }
    if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
      throw new CartDomainError(
        "Количество должно быть целым числом больше нуля.",
        400,
        "invalid_quantity",
      );
    }

    const product = await this.dependencies.getProductDetail(normalizedProductId);
    const createdAt = this.now();
    const proposal: StoredProposal = {
      proposalId: this.createId(),
      cartId,
      productId: product.id,
      productName: product.name,
      requestedQuantity,
      actualStock: product.stock,
      unitPrice: product.price,
      total: product.price === null ? null : product.price * requestedQuantity,
      expiresAt: new Date(createdAt.getTime() + this.proposalTtlMs).toISOString(),
      status: "pending",
      confirmedAt: null,
      confirmedItem: null,
    };
    this.proposals.set(proposal.proposalId, proposal);
    return publicProposal(proposal);
  }

  cancelProposal(cartId: string, proposalId: string): CartProposal {
    const proposal = this.requireOwnedProposal(cartId, proposalId);
    if (proposal.status === "confirmed") {
      throw new CartDomainError(
        "Предложение уже подтверждено.",
        409,
        "already_confirmed",
      );
    }
    if (proposal.status === "processing") {
      throw new CartDomainError(
        "Подтверждение уже обрабатывается.",
        409,
        "confirmation_in_progress",
      );
    }
    proposal.status = "cancelled";
    return publicProposal(proposal);
  }

  async confirmProposal(
    cartId: string,
    proposalId: string,
    requestedQuantity?: number,
  ): Promise<CartConfirmation> {
    const proposal = this.requireOwnedProposal(cartId, proposalId);
    const confirmationQuantity = requestedQuantity ?? proposal.requestedQuantity;

    if (!Number.isInteger(confirmationQuantity) || confirmationQuantity <= 0) {
      throw new CartDomainError(
        "Количество должно быть целым числом больше нуля.",
        400,
        "invalid_quantity",
      );
    }

    if (proposal.status === "confirmed" && proposal.confirmedItem) {
      if (confirmationQuantity !== proposal.requestedQuantity) {
        throw new CartDomainError(
          "Предложение уже подтверждено с другим количеством.",
          409,
          "already_confirmed",
        );
      }
      return {
        proposal: publicProposal(proposal),
        item: proposal.confirmedItem,
        cart: this.getCart(cartId),
        alreadyConfirmed: true,
      };
    }
    if (proposal.status === "cancelled") {
      throw new CartDomainError("Предложение отменено.", 409, "proposal_cancelled");
    }
    if (proposal.status === "processing") {
      throw new CartDomainError(
        "Подтверждение уже обрабатывается. Повторите запрос через секунду.",
        409,
        "confirmation_in_progress",
      );
    }
    if (this.now().getTime() >= new Date(proposal.expiresAt).getTime()) {
      throw new CartDomainError(
        "Срок действия предложения истёк. Создайте новое.",
        410,
        "proposal_expired",
      );
    }
    proposal.status = "processing";
    try {
      // Never trust the stock, price or name captured at proposal time. Confirmation
      // always uses a fresh product detail response from EKT.
      const currentProduct = await this.dependencies.getProductDetail(proposal.productId);
      if (currentProduct.stock === null) {
        throw new CartDomainError(
          "EKT API не вернул точный остаток. Добавление отменено.",
          409,
          "stock_unknown",
        );
      }
      if (currentProduct.stock <= 0 || currentProduct.available === false) {
        throw new CartDomainError(
          "Товар закончился. Остаток был повторно проверен.",
          409,
          "out_of_stock",
        );
      }

      const cart = this.carts.get(cartId) ?? new Map<string, CartItem>();
      const existingQuantity = cart.get(currentProduct.id)?.quantity ?? 0;
      const resultingQuantity = existingQuantity + confirmationQuantity;
      if (resultingQuantity > currentProduct.stock) {
        throw new CartDomainError(
          `Доступно только ${currentProduct.stock} шт. С учётом корзины запрошено ${resultingQuantity} шт.`,
          409,
          "quantity_exceeds_stock",
        );
      }

      const item: CartItem = {
        product: currentProduct,
        quantity: resultingQuantity,
        addedAt: this.now().toISOString(),
      };
      cart.set(currentProduct.id, item);
      this.carts.set(cartId, cart);
      proposal.requestedQuantity = confirmationQuantity;
      proposal.productName = currentProduct.name;
      proposal.actualStock = currentProduct.stock;
      proposal.unitPrice = currentProduct.price;
      proposal.total =
        currentProduct.price === null ? null : currentProduct.price * confirmationQuantity;
      proposal.status = "confirmed";
      proposal.confirmedAt = this.now().toISOString();
      proposal.confirmedItem = item;

      return {
        proposal: publicProposal(proposal),
        item,
        cart: this.getCart(cartId),
        alreadyConfirmed: false,
      };
    } catch (error) {
      if (proposal.status === "processing") proposal.status = "pending";
      throw error;
    }
  }

  private requireOwnedProposal(cartId: string, proposalId: string): StoredProposal {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.cartId !== cartId) {
      throw new CartDomainError("Предложение не найдено.", 404, "proposal_not_found");
    }
    return proposal;
  }
}
