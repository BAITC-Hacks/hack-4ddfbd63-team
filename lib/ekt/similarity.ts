import type {
  AnalogueResult,
  CharacteristicDifference,
  MatchedCharacteristic,
} from "@/lib/ekt/analogue-types";
import type { EktProduct, ProductCharacteristic } from "@/lib/ekt/types";

type Dimension = {
  key: string;
  label: string;
  weight: number;
  patterns: RegExp[];
};

const CATEGORY_WEIGHT = 24;
const NAME_WEIGHT = 8;
const BRAND_WEIGHT = 3;

// These are aliases for characteristic names actually supplied by EKT. Values are
// never invented or inferred: only exact normalized API values can count as a match.
const HIGH_PRIORITY_DIMENSIONS: Dimension[] = [
  {
    key: "nominal_current",
    label: "Номинальный ток",
    weight: 20,
    patterns: [/номинальн.*ток/, /nominaln.*tok/],
  },
  {
    key: "voltage",
    label: "Напряжение",
    weight: 18,
    patterns: [/напряжен/, /napryazhen/, /voltage/],
  },
  {
    key: "poles",
    label: "Количество полюсов",
    weight: 18,
    patterns: [/полюс/, /polyus/, /poles?/],
  },
  {
    key: "trip_characteristic",
    label: "Характеристика срабатывания",
    weight: 18,
    patterns: [/характеристик.*срабатыван/, /kharakteristik.*srabat/, /trip.*curve/],
  },
  {
    key: "power",
    label: "Мощность",
    weight: 16,
    patterns: [/мощност/, /moshchnost/, /power/],
  },
  {
    key: "type",
    label: "Тип",
    weight: 15,
    patterns: [/^тип($| )/, /^вид($| )/, /^tip($| )/, /tip izdel/, /vid izdel/],
  },
  {
    key: "execution",
    label: "Исполнение",
    weight: 12,
    patterns: [/исполнен/, /ispolnen/, /тип установк/, /tip ustanov/],
  },
];

type IndexedCharacteristic = ProductCharacteristic & {
  key: string;
  weight: number;
  highPriority: boolean;
};

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}

function normalizeValue(value: string): string {
  return normalizeText(value).replace(/\s+/g, "");
}

function dimensionFor(name: string): Dimension | null {
  const normalized = normalizeText(name);
  return (
    HIGH_PRIORITY_DIMENSIONS.find((dimension) =>
      dimension.patterns.some((pattern) => pattern.test(normalized)),
    ) ?? null
  );
}

function indexCharacteristics(product: EktProduct): Map<string, IndexedCharacteristic> {
  const result = new Map<string, IndexedCharacteristic>();
  for (const characteristic of product.characteristics) {
    const dimension = dimensionFor(characteristic.name);
    const key = dimension?.key ?? `property:${normalizeText(characteristic.name)}`;
    if (!key || result.has(key)) continue;
    result.set(key, {
      ...characteristic,
      key,
      weight: dimension?.weight ?? 2,
      highPriority: Boolean(dimension),
    });
  }
  return result;
}

export function productCategorySegments(product: EktProduct): string[] {
  if (product.category) return [normalizeText(product.category)];
  if (!product.productUrl) return [];
  try {
    const parts = new URL(product.productUrl).pathname
      .split("/")
      .filter(Boolean)
      .map((part) => normalizeText(decodeURIComponent(part)))
      .filter(Boolean);
    const catalogIndex = parts.indexOf("catalog");
    const categoryParts = catalogIndex >= 0 ? parts.slice(catalogIndex + 1, -1) : parts.slice(0, -1);
    return categoryParts;
  } catch {
    return [];
  }
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((token) => token.length > 1),
  );
}

export function nameSimilarity(left: string, right: string): number {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const intersection = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function compareCategories(source: EktProduct, candidate: EktProduct) {
  const sourceParts = productCategorySegments(source);
  const candidateParts = productCategorySegments(candidate);
  const sourceCategory = sourceParts.join(" / ") || null;
  const candidateCategory = candidateParts.join(" / ") || null;
  if (sourceParts.length === 0 || candidateParts.length === 0) {
    return { match: "unknown" as const, ratio: 0, sourceCategory, candidateCategory };
  }
  if (sourceCategory === candidateCategory) {
    return { match: "exact" as const, ratio: 1, sourceCategory, candidateCategory };
  }
  const sharedPrefix = sourceParts.filter((part, index) => candidateParts[index] === part).length;
  const sameLeaf = sourceParts.at(-1) === candidateParts.at(-1);
  const ratio = sameLeaf ? 0.8 : sharedPrefix / Math.max(sourceParts.length, candidateParts.length);
  return {
    match: ratio > 0 ? ("partial" as const) : ("different" as const),
    ratio,
    sourceCategory,
    candidateCategory,
  };
}

export function preliminaryAnalogueScore(
  source: EktProduct,
  candidate: EktProduct,
  recommended: boolean,
): number {
  const category = compareCategories(source, candidate);
  return (
    (recommended ? 1_000 : 0) +
    category.ratio * 300 +
    nameSimilarity(source.name, candidate.name) * 100
  );
}

export function scoreAnalogue(source: EktProduct, candidate: EktProduct): AnalogueResult {
  const sourceCharacteristics = indexCharacteristics(source);
  const candidateCharacteristics = indexCharacteristics(candidate);
  const matchedCharacteristics: MatchedCharacteristic[] = [];
  const differences: CharacteristicDifference[] = [];
  let comparableWeight = NAME_WEIGHT;
  let matchedWeight = nameSimilarity(source.name, candidate.name) * NAME_WEIGHT;

  const category = compareCategories(source, candidate);
  if (category.match !== "unknown") {
    comparableWeight += CATEGORY_WEIGHT;
    matchedWeight += category.ratio * CATEGORY_WEIGHT;
    if (category.match === "exact") {
      matchedCharacteristics.push({
        key: "category",
        name: "Категория",
        sourceValue: category.sourceCategory ?? "",
        candidateValue: category.candidateCategory ?? "",
        weight: CATEGORY_WEIGHT,
      });
    } else {
      differences.push({
        key: "category",
        name: "Категория",
        sourceValue: category.sourceCategory ?? "Не указана",
        candidateValue: category.candidateCategory,
        weight: CATEGORY_WEIGHT,
      });
    }
  }

  for (const sourceCharacteristic of sourceCharacteristics.values()) {
    const candidateCharacteristic = candidateCharacteristics.get(sourceCharacteristic.key);
    if (!candidateCharacteristic) {
      if (sourceCharacteristic.highPriority) {
        comparableWeight += sourceCharacteristic.weight;
        differences.push({
          key: sourceCharacteristic.key,
          name: sourceCharacteristic.name,
          sourceValue: sourceCharacteristic.value,
          candidateValue: null,
          weight: sourceCharacteristic.weight,
        });
      }
      continue;
    }

    comparableWeight += sourceCharacteristic.weight;
    if (normalizeValue(sourceCharacteristic.value) === normalizeValue(candidateCharacteristic.value)) {
      matchedWeight += sourceCharacteristic.weight;
      matchedCharacteristics.push({
        key: sourceCharacteristic.key,
        name: sourceCharacteristic.name,
        sourceValue: sourceCharacteristic.value,
        candidateValue: candidateCharacteristic.value,
        weight: sourceCharacteristic.weight,
      });
    } else {
      differences.push({
        key: sourceCharacteristic.key,
        name: sourceCharacteristic.name,
        sourceValue: sourceCharacteristic.value,
        candidateValue: candidateCharacteristic.value,
        weight: sourceCharacteristic.weight,
      });
    }
  }

  let sameBrand: boolean | null = null;
  if (source.brand && candidate.brand) {
    sameBrand = normalizeValue(source.brand) === normalizeValue(candidate.brand);
    comparableWeight += BRAND_WEIGHT;
    if (sameBrand) {
      matchedWeight += BRAND_WEIGHT;
      matchedCharacteristics.push({
        key: "brand",
        name: "Производитель",
        sourceValue: source.brand,
        candidateValue: candidate.brand,
        weight: BRAND_WEIGHT,
      });
    } else {
      differences.push({
        key: "brand",
        name: "Производитель",
        sourceValue: source.brand,
        candidateValue: candidate.brand,
        weight: BRAND_WEIGHT,
      });
    }
  }

  matchedCharacteristics.sort((left, right) => right.weight - left.weight);
  differences.sort((left, right) => right.weight - left.weight);
  const similarity = nameSimilarity(source.name, candidate.name);
  const score = comparableWeight > 0 ? Math.round((matchedWeight / comparableWeight) * 100) : 0;

  return {
    product: candidate,
    score: Math.max(0, Math.min(100, score)),
    matchedCharacteristics,
    differences,
    explanationData: {
      categoryMatch: category.match,
      sourceCategory: category.sourceCategory,
      candidateCategory: category.candidateCategory,
      sameBrand,
      nameSimilarity: Math.round(similarity * 100),
      matchedWeight: Math.round(matchedWeight * 100) / 100,
      comparableWeight,
      matchedHighPriorityCount: matchedCharacteristics.filter((item) => item.weight >= 12).length,
    },
  };
}

export function rankAnalogueCandidates(
  source: EktProduct,
  candidates: EktProduct[],
): AnalogueResult[] {
  return candidates
    .filter(
      (candidate) =>
        candidate.id !== source.id &&
        candidate.stock !== null &&
        candidate.stock > 0 &&
        candidate.available !== false,
    )
    .map((candidate) => scoreAnalogue(source, candidate))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.explanationData.matchedHighPriorityCount -
          left.explanationData.matchedHighPriorityCount ||
        left.product.id.localeCompare(right.product.id, "ru", { numeric: true }),
    );
}
