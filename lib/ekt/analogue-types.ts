import type { EktProduct } from "@/lib/ekt/types";

export type MatchedCharacteristic = {
  key: string;
  name: string;
  sourceValue: string;
  candidateValue: string;
  weight: number;
};

export type CharacteristicDifference = {
  key: string;
  name: string;
  sourceValue: string;
  candidateValue: string | null;
  weight: number;
};

export type AnalogueExplanationData = {
  categoryMatch: "exact" | "partial" | "different" | "unknown";
  sourceCategory: string | null;
  candidateCategory: string | null;
  sameBrand: boolean | null;
  nameSimilarity: number;
  matchedWeight: number;
  comparableWeight: number;
  matchedHighPriorityCount: number;
};

export type AnalogueResult = {
  product: EktProduct;
  score: number;
  matchedCharacteristics: MatchedCharacteristic[];
  differences: CharacteristicDifference[];
  explanationData: AnalogueExplanationData;
};
