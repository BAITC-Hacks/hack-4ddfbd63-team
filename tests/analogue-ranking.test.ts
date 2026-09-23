import { describe, expect, it } from "vitest";

import { rankAnalogueCandidates } from "@/lib/ekt/similarity";
import type { EktProduct } from "@/lib/ekt/types";

function product(overrides: Partial<EktProduct>): EktProduct {
  return {
    id: "source",
    sku: null,
    name: "Автоматический выключатель 3P 160A",
    category: null,
    price: 1_000,
    currency: null,
    stock: 0,
    available: false,
    characteristics: [
      { name: "Номинальный ток", value: "160 А" },
      { name: "Номинальное напряжение", value: "400 В" },
      { name: "Количество полюсов", value: "3" },
      { name: "Тип изделия", value: "Автоматический выключатель" },
    ],
    certificates: [],
    brand: "Brand A",
    description: null,
    imageUrl: null,
    productUrl: "https://ekt.example/catalog/low_voltage/breakers/source/",
    stores: [],
    recommendedProductIds: [],
    ...overrides,
  };
}

describe("deterministic analogue ranking", () => {
  it("ставит совпадающие ключевые характеристики выше и исключает stock <= 0", () => {
    const source = product({});
    const close = product({
      id: "close",
      stock: 7,
      available: true,
      brand: "Brand B",
      name: "Автоматический выключатель 3P 160A аналог",
    });
    const different = product({
      id: "different",
      stock: 12,
      available: true,
      name: "Автоматический выключатель 1P 16A",
      characteristics: [
        { name: "Номинальный ток", value: "16 А" },
        { name: "Номинальное напряжение", value: "230 В" },
        { name: "Количество полюсов", value: "1" },
        { name: "Тип изделия", value: "Автоматический выключатель" },
      ],
    });
    const unavailable = product({ id: "empty", stock: 0, available: false });

    const ranked = rankAnalogueCandidates(source, [different, unavailable, close]);

    expect(ranked.map((item) => item.product.id)).toEqual(["close", "different"]);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked[0].matchedCharacteristics.map((item) => item.key)).toEqual(
      expect.arrayContaining(["nominal_current", "voltage", "poles", "type"]),
    );
    expect(ranked[0].differences).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "brand" })]),
    );
  });
});
