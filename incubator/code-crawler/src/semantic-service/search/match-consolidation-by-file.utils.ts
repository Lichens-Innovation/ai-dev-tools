import { isNullish } from "@lichens-innovation/ts-common";

import type { QueryMatchSummary } from "../types/search.types";

/**
 * Collapses per-chunk KNN hits into one row per file for semantic search results.
 * Fetches extra chunks upstream; this module groups by `fileId`, boosts multi-hit files, and re-sorts by effective distance.
 */

/** How many raw chunk neighbors to fetch per requested file (dedupe shrinks the list). */
const FILE_CONSOLIDATION_CHUNK_FETCH_FACTOR = 4;

/** Upper bound on KNN size so consolidation stays cheap on large indexes. */
const FILE_CONSOLIDATION_CHUNK_FETCH_ABSOLUTE_MAX = 250;

/** Divides effective distance by `1 + weight * (hitCount - 1)` so multi-chunk files rank higher. */
const FILE_CONSOLIDATION_MULTI_CHUNK_BOOST_WEIGHT = 0.25;

/**
 * Chunks farther than this relative band from the file's best distance do not increase the boost
 * (weak neighbors from oversplitting no longer count like strong ones).
 */
const FILE_CONSOLIDATION_MULTI_HIT_PROXIMITY_RELATIVE_SLACK = 0.12;

/** Caps how many proximity-eligible chunks can increase the boost (limits huge-file / fine-chunk bias). */
const FILE_CONSOLIDATION_MULTI_HIT_BOOST_MAX_CHUNKS = 6;

export const resolveChunkFetchCountForFileConsolidation = (maxFiles: number): number => {
  if (maxFiles < 1) {
    return 0;
  }

  const scaled = Math.ceil(maxFiles * FILE_CONSOLIDATION_CHUNK_FETCH_FACTOR);
  return Math.min(FILE_CONSOLIDATION_CHUNK_FETCH_ABSOLUTE_MAX, Math.max(maxFiles, scaled));
};

export const groupQueryMatchesByFileId = (matches: QueryMatchSummary[]): Map<string, QueryMatchSummary[]> => {
  const byFileId = new Map<string, QueryMatchSummary[]>();

  for (const match of matches) {
    const existing = byFileId.get(match.fileId);
    if (isNullish(existing)) {
      byFileId.set(match.fileId, [match]);
      continue;
    }
    existing.push(match);
  }

  return byFileId;
};

export const pickBestChunkMatch = (chunks: QueryMatchSummary[]): QueryMatchSummary => {
  const [first, ...rest] = chunks;
  if (isNullish(first)) {
    throw new Error("[pickBestChunkMatch] chunks must be non-empty");
  }

  return rest.reduce((best, current) => (current.distance < best.distance ? current : best), first);
};

export interface ComputeEffectiveDistanceForFileHitsArgs {
  bestDistance: number;
  /** Number of chunk hits used in the divisor (caller may cap / filter; must be ≥ 1 when boosting). */
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

interface CountChunkHitsWithinBestProximityBandArgs {
  chunks: QueryMatchSummary[];
  bestDistance: number;
  relativeSlack: number;
}

const countChunkHitsWithinBestProximityBand = ({
  chunks,
  bestDistance,
  relativeSlack,
}: CountChunkHitsWithinBestProximityBandArgs): number => {
  const maxDistance = bestDistance * (1 + relativeSlack);
  let hitsInProximityBand = 0;
  for (const chunk of chunks) {
    if (chunk.distance <= maxDistance) {
      hitsInProximityBand += 1;
    }
  }
  return hitsInProximityBand;
};

export const buildAggregatedQueryMatchFromFileChunks = (chunks: QueryMatchSummary[]): QueryMatchSummary => {
  const representative = pickBestChunkMatch(chunks);
  const eligibleForBoost = countChunkHitsWithinBestProximityBand({
    chunks,
    bestDistance: representative.distance,
    relativeSlack: FILE_CONSOLIDATION_MULTI_HIT_PROXIMITY_RELATIVE_SLACK,
  });
  const boostHitCount = Math.min(Math.max(1, eligibleForBoost), FILE_CONSOLIDATION_MULTI_HIT_BOOST_MAX_CHUNKS);
  const effectiveDistance = computeEffectiveDistanceForFileHits({
    bestDistance: representative.distance,
    hitCount: boostHitCount,
    weight: FILE_CONSOLIDATION_MULTI_CHUNK_BOOST_WEIGHT,
  });

  return {
    ...representative,
    distance: effectiveDistance,
    relatedChunkCount: chunks.length,
  };
};

export interface ConsolidateSemanticQueryMatchesByFileArgs {
  matches: QueryMatchSummary[];
  nResults: number;
}

export const consolidateSemanticQueryMatchesByFile = ({
  matches,
  nResults,
}: ConsolidateSemanticQueryMatchesByFileArgs): QueryMatchSummary[] => {
  if (nResults < 1 || matches.length === 0) {
    return [];
  }

  const byFile = groupQueryMatchesByFileId(matches);
  const aggregated: QueryMatchSummary[] = [];

  for (const chunks of byFile.values()) {
    if (chunks.length === 0) {
      continue;
    }
    aggregated.push(buildAggregatedQueryMatchFromFileChunks(chunks));
  }

  aggregated.sort((a, b) => a.distance - b.distance);
  return aggregated.slice(0, nResults);
};
