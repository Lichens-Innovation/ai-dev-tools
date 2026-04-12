import type { QueryMatchSummary } from "./semantic-search.types";

/** How many raw chunk neighbors to fetch per requested file (dedupe shrinks the list). */
const FILE_CONSOLIDATION_CHUNK_FETCH_FACTOR = 4;

/** Upper bound on KNN size so consolidation stays cheap on large indexes. */
const FILE_CONSOLIDATION_CHUNK_FETCH_ABSOLUTE_MAX = 250;

/** Divides effective distance by `1 + weight * (hitCount - 1)` so multi-chunk files rank higher. */
const FILE_CONSOLIDATION_MULTI_CHUNK_BOOST_WEIGHT = 0.25;

export const resolveChunkFetchCountForFileConsolidation = ({ maxFiles }: { maxFiles: number }): number => {
  if (maxFiles < 1) {
    return 0;
  }

  const scaled = Math.ceil(maxFiles * FILE_CONSOLIDATION_CHUNK_FETCH_FACTOR);
  return Math.min(FILE_CONSOLIDATION_CHUNK_FETCH_ABSOLUTE_MAX, Math.max(maxFiles, scaled));
};

export const groupQueryMatchesByFileId = (matches: QueryMatchSummary[]): Map<string, QueryMatchSummary[]> => {
  const byFileId = new Map<string, QueryMatchSummary[]>();

  for (const match of matches) {
    const list = byFileId.get(match.fileId);
    if (list) {
      list.push(match);
    } else {
      byFileId.set(match.fileId, [match]);
    }
  }

  return byFileId;
};

export const pickBestChunkMatch = (chunks: QueryMatchSummary[]): QueryMatchSummary => {
  let best = chunks[0];
  if (!best) {
    throw new Error("[pickBestChunkMatch] chunks must be non-empty");
  }

  for (let i = 1; i < chunks.length; i += 1) {
    const current = chunks[i];
    if (current && current.distance < best.distance) {
      best = current;
    }
  }

  return best;
};

interface ComputeEffectiveDistanceForFileHitsArgs {
  bestDistance: number;
  hitCount: number;
  weight: number;
}

export const computeEffectiveDistanceForFileHits = ({
  bestDistance,
  hitCount,
  weight,
}: ComputeEffectiveDistanceForFileHitsArgs): number => {
  if (hitCount < 1) {
    return bestDistance;
  }

  const divisor = 1 + weight * (hitCount - 1);
  return bestDistance / divisor;
};

export const buildAggregatedQueryMatchFromFileChunks = (chunks: QueryMatchSummary[]): QueryMatchSummary => {
  const representative = pickBestChunkMatch(chunks);
  const hitCount = chunks.length;
  const effectiveDistance = computeEffectiveDistanceForFileHits({
    bestDistance: representative.distance,
    hitCount,
    weight: FILE_CONSOLIDATION_MULTI_CHUNK_BOOST_WEIGHT,
  });

  return {
    ...representative,
    distance: effectiveDistance,
    relatedChunkCount: hitCount,
  };
};

interface ConsolidateSemanticQueryMatchesByFileArgs {
  matches: QueryMatchSummary[];
  targetFileCount: number;
}

export const consolidateSemanticQueryMatchesByFile = ({
  matches,
  targetFileCount,
}: ConsolidateSemanticQueryMatchesByFileArgs): QueryMatchSummary[] => {
  if (targetFileCount < 1 || matches.length === 0) {
    return [];
  }

  const byFile = groupQueryMatchesByFileId(matches);
  const aggregated: QueryMatchSummary[] = [];

  for (const chunks of byFile.values()) {
    if (chunks.length > 0) {
      aggregated.push(buildAggregatedQueryMatchFromFileChunks(chunks));
    }
  }

  aggregated.sort((a, b) => a.distance - b.distance);
  return aggregated.slice(0, targetFileCount);
};
