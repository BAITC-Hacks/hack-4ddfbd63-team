import "server-only";

import type { AnalogueResult } from "@/lib/ekt/analogue-types";
import { getProductDetail, getProducts } from "@/lib/ekt/adapter";
import {
  preliminaryAnalogueScore,
  rankAnalogueCandidates,
} from "@/lib/ekt/similarity";
import type { EktProduct } from "@/lib/ekt/types";

const DEFAULT_MAX_PAGES = 20;
const DEFAULT_DETAIL_CANDIDATES = 24;
const DETAIL_CONCURRENCY = 6;

async function loadCandidateDetails(ids: string[]): Promise<EktProduct[]> {
  const results: EktProduct[] = [];
  for (let index = 0; index < ids.length; index += DETAIL_CONCURRENCY) {
    const batch = ids.slice(index, index + DETAIL_CONCURRENCY);
    const settled = await Promise.allSettled(batch.map((id) => getProductDetail(id)));
    for (const result of settled) {
      if (result.status === "fulfilled") results.push(result.value);
    }
  }
  return results;
}

export async function findAnalogues(productId: string | number): Promise<AnalogueResult[]> {
  const source = await getProductDetail(productId);
  if (source.stock !== 0 && source.available !== false) return [];

  const recommendedIds = new Set(source.recommendedProductIds);
  const configuredMaxPages = Number(process.env.EKT_ANALOG_MAX_PAGES ?? process.env.EKT_SEARCH_MAX_PAGES);
  const maxPages = Number.isInteger(configuredMaxPages) && configuredMaxPages > 0
    ? Math.min(configuredMaxPages, 100)
    : DEFAULT_MAX_PAGES;
  const summaries = new Map<string, EktProduct>();

  for (let page = 1; page <= maxPages; page += 1) {
    const result = await getProducts(page);
    result.products.forEach((product) => {
      if (product.id !== source.id) summaries.set(product.id, product);
    });
    if (result.products.length === 0 || result.hasNextPage === false) break;
    if (result.totalPages !== null && page >= result.totalPages) break;
  }

  const rankedSummaries = Array.from(summaries.values()).sort((left, right) => {
    const scoreDifference =
      preliminaryAnalogueScore(source, right, recommendedIds.has(right.id)) -
      preliminaryAnalogueScore(source, left, recommendedIds.has(left.id));
    return scoreDifference || left.id.localeCompare(right.id, "ru", { numeric: true });
  });
  const candidateIds = Array.from(
    new Set([
      ...source.recommendedProductIds,
      ...rankedSummaries.slice(0, DEFAULT_DETAIL_CANDIDATES).map((product) => product.id),
    ]),
  ).filter((id) => id !== source.id);

  const detailedCandidates = await loadCandidateDetails(candidateIds);
  return rankAnalogueCandidates(source, detailedCandidates).slice(0, 3);
}
