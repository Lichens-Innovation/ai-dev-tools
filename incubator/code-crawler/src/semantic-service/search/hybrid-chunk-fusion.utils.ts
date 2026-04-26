import { isNullish } from "@lichens-innovation/ts-common";

import type { QueryMatchSummary } from "../types/search.types";

export interface RrfFuseChunkMatchesArgs {
  lexicalMatches: QueryMatchSummary[];
  vectorMatches: QueryMatchSummary[];
  /** Share of the RRF score attributed to semantic (vector) matches. Default: 0.7 */
  weightSemantic?: number;
  /** RRF smoothing constant — dampens the rank advantage of top results. Default: 60 */
  rrfK?: number;
}

interface PickRepresentativeMatchArgs {
  vectorMatch?: QueryMatchSummary;
  lexicalMatch?: QueryMatchSummary;
}

const pickRepresentativeMatch = ({ vectorMatch, lexicalMatch }: PickRepresentativeMatchArgs): QueryMatchSummary => {
  if (!isNullish(vectorMatch)) {
    return vectorMatch;
  }

  if (!isNullish(lexicalMatch)) {
    return lexicalMatch;
  }

  throw new Error("[pickRepresentativeMatch] at least one match is required");
};

/**
 * Fuses vector KNN hits with lexical BM25 hits using Reciprocal Rank Fusion (RRF).
 * RRF_score = weightSemantic / (rrfK + rank_vector) + (1 − weightSemantic) / (rrfK + rank_lexical)
 * Missing branch contributes 0. Result mapped to `distance` ascending (lower = better).
 */
export const fuseChunkMatchesWithRRF = ({
  lexicalMatches,
  vectorMatches,
  weightSemantic = 0.7,
  rrfK = 60,
}: RrfFuseChunkMatchesArgs): QueryMatchSummary[] => {
  const weightLexical = 1 - weightSemantic;

  const vectorRankById = new Map<string, number>();
  vectorMatches.forEach((match, index) => vectorRankById.set(match.id, index + 1));

  const lexicalRankById = new Map<string, number>();
  lexicalMatches.forEach((match, index) => lexicalRankById.set(match.id, index + 1));

  const vectorMatchById = new Map<string, QueryMatchSummary>();
  for (const match of vectorMatches) {
    vectorMatchById.set(match.id, match);
  }

  const lexicalMatchById = new Map<string, QueryMatchSummary>();
  for (const match of lexicalMatches) {
    lexicalMatchById.set(match.id, match);
  }

  const unionIds = new Set<string>([...vectorMatchById.keys(), ...lexicalMatchById.keys()]);
  const hybridMatches: QueryMatchSummary[] = [];

  for (const id of unionIds) {
    const vectorRank = vectorRankById.get(id);
    const lexicalRank = lexicalRankById.get(id);

    const rrfScore =
      (!isNullish(vectorRank) ? weightSemantic / (rrfK + vectorRank) : 0) +
      (!isNullish(lexicalRank) ? weightLexical / (rrfK + lexicalRank) : 0);

    const distance = 1 / rrfScore;
    const base = pickRepresentativeMatch({
      vectorMatch: vectorMatchById.get(id),
      lexicalMatch: lexicalMatchById.get(id),
    });

    hybridMatches.push({
      ...base,
      distance,
    });
  }

  hybridMatches.sort((left, right) => left.distance - right.distance);
  return hybridMatches;
};
