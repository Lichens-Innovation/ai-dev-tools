import { isNullish } from "@lichens-innovation/ts-common";

import type { QueryMatchSummary } from "../types/search.types";

const HYBRID_WEIGHT_VECTOR = 0.7;
const HYBRID_WEIGHT_LEXICAL = 0.3;
// Numerical epsilon: guards min–max division and 1/hybrid when spans or hybrid are ~0.
const HYBRID_EPS = 1e-9;

export interface FuseHybridChunkMatchesArgs {
  lexicalMatches: QueryMatchSummary[];
  vectorMatches: QueryMatchSummary[];
}

const minMaxLowerIsBetter = (values: number[]): { min: number; max: number } => {
  if (values.length === 0) {
    return { min: 0, max: 0 };
  }

  return { min: Math.min(...values), max: Math.max(...values) };
};

interface ToSimLowerIsBetterParams {
  value: number;
  min: number;
  max: number;
}

const toSimLowerIsBetter = ({ value, min, max }: ToSimLowerIsBetterParams): number => {
  const span = max - min;
  if (span <= HYBRID_EPS) {
    return 1;
  }

  return (max - value) / (span + HYBRID_EPS);
};

const pickRepresentativeMatch = (
  vectorMatch?: QueryMatchSummary,
  lexicalMatch?: QueryMatchSummary
): QueryMatchSummary => {
  if (!isNullish(vectorMatch)) {
    return vectorMatch;
  }

  if (!isNullish(lexicalMatch)) {
    return lexicalMatch;
  }

  throw new Error("[pickRepresentativeMatch] at least one match is required");
};

/**
 * Merges vector KNN hits with lexical BM25 hits using fixed 0.7/0.3 weights and per-branch min–max
 * similarity in [0, 1]. Missing branch contributes 0. Maps to `distance` ascending for consolidation.
 */
export const fuseHybridChunkMatches = ({
  lexicalMatches,
  vectorMatches,
}: FuseHybridChunkMatchesArgs): QueryMatchSummary[] => {
  const vectorMatchById = new Map<string, QueryMatchSummary>();
  for (const match of vectorMatches) {
    vectorMatchById.set(match.id, match);
  }
  const lexicalMatchById = new Map<string, QueryMatchSummary>();
  for (const match of lexicalMatches) {
    lexicalMatchById.set(match.id, match);
  }

  const vectorDistances: number[] = vectorMatches.map((match) => match.distance);
  const lexicalDistances: number[] = lexicalMatches.map((match) => match.distance);

  const { min: dMin, max: dMax } = minMaxLowerIsBetter(vectorDistances);
  const { min: bMin, max: bMax } = minMaxLowerIsBetter(lexicalDistances);

  const unionIds = new Set<string>([...vectorMatchById.keys(), ...lexicalMatchById.keys()]);
  const hybridMatches: QueryMatchSummary[] = [];

  for (const id of unionIds) {
    const vectorMatch = vectorMatchById.get(id);
    const lexicalMatch = lexicalMatchById.get(id);

    const simVec = isNullish(vectorMatch)
      ? 0
      : toSimLowerIsBetter({ value: vectorMatch.distance, min: dMin, max: dMax });
    const simLex = isNullish(lexicalMatch)
      ? 0
      : toSimLowerIsBetter({ value: lexicalMatch.distance, min: bMin, max: bMax });

    const hybrid = HYBRID_WEIGHT_VECTOR * simVec + HYBRID_WEIGHT_LEXICAL * simLex;
    const distance = 1 / (hybrid + HYBRID_EPS);
    const base = pickRepresentativeMatch(vectorMatch, lexicalMatch);

    hybridMatches.push({
      ...base,
      distance,
    });
  }

  hybridMatches.sort((a, b) => a.distance - b.distance);
  return hybridMatches;
};
