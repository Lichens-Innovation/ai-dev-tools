import { getErrorMessage, isNotBlank, isNullish } from "@lichens-innovation/ts-common";
import { embedTextsWithLanguageModel } from "../language-model-embedding.pipeline";
import type { QueryMatchSummary, QueryOutcome } from "../types/search.types";
import type { SourceLanguageId } from "../types/source-language.types";
import type { SemanticIndexStore } from "../types/store.types";
import { getCodeCrawlerMultiQueryVariantCount } from "../../utils/env.utils";
import { rerankWithCrossEncoder } from "./cross-encoder-rerank.utils";
import { fuseChunkMatchesWithRRF } from "./hybrid-chunk-fusion.utils";
import {
  consolidateSemanticQueryMatchesByFile,
  resolveChunkFetchCountForFileConsolidation,
} from "./match-consolidation-by-file.utils";
import { generateQueryExpansionVariants } from "./query-expansion.pipeline";

export const EXAMPLE_QUERY_TEXT = "tanstack query returning a list of items with an infinite staleTime";

export const SEARCH_MODE_VALUES = ["vector", "lexical", "hybrid"] as const;
export type SearchMode = (typeof SEARCH_MODE_VALUES)[number];

interface RunWorkspaceSemanticQueryArgs {
  store: SemanticIndexStore;
  nResults: number;
  queryText: string;
  repository?: string;
  languages?: readonly SourceLanguageId[];
  searchMode?: SearchMode;
  useReranker?: boolean;
  useMultiQuery?: boolean;
}

interface SafeQueryLexicalChunksArgs {
  store: SemanticIndexStore;
  queryText: string;
  nResults: number;
  repository?: string;
  languages?: readonly SourceLanguageId[];
}

const safeQueryLexicalChunks = ({
  store,
  queryText,
  nResults,
  repository,
  languages,
}: SafeQueryLexicalChunksArgs): QueryMatchSummary[] => {
  try {
    return store.queryLexicalChunks({ queryText, nResults, repository, languages });
  } catch (lexErr: unknown) {
    const msg = getErrorMessage(lexErr);
    console.warn(`[safeQueryLexicalChunks] BM25/FTS query failed; returning no lexical matches: ${msg}`);
    return [];
  }
};

interface SafeRerankWithCrossEncoderArgs {
  queryText: string;
  matches: QueryMatchSummary[];
}

const safeRerankWithCrossEncoder = async ({
  queryText,
  matches,
}: SafeRerankWithCrossEncoderArgs): Promise<QueryMatchSummary[]> => {
  if (matches.length < 2) {
    return matches;
  }

  try {
    return await rerankWithCrossEncoder({ queryText, matches });
  } catch (rerankErr: unknown) {
    const msg = getErrorMessage(rerankErr);
    console.warn(`[safeRerankWithCrossEncoder] cross-encoder rerank skipped (hybrid order kept): ${msg}`);
    return matches;
  }
};

const expandQueryVariants = async (queryText: string): Promise<string[]> => {
  const count = getCodeCrawlerMultiQueryVariantCount();
  try {
    const variants = await generateQueryExpansionVariants({ queryText, count });
    const result = [queryText, ...variants];
    console.info(
      `[expandQueryVariants] ${result.length} queries (original + ${variants.length} variant(s)):\n${result.map((q, i) => `  [${i}] ${q}`).join("\n\t")}`
    );
    return result;
  } catch (err: unknown) {
    const msg = getErrorMessage(err);
    console.warn(`[expandQueryVariants] LLM expansion failed; using original query only: ${msg}`);
    return [queryText];
  }
};

/** RRF across several ranked lists (e.g. one KNN list per query variant), equal weight per list. */
const fuseRankedListsWithEqualWeightRRF = (rankedLists: QueryMatchSummary[][]): QueryMatchSummary[] => {
  const rrfK = 60;
  const weight = 1 / rankedLists.length;
  const scoreMap = new Map<string, { match: QueryMatchSummary; score: number }>();

  for (const matches of rankedLists) {
    for (let rank = 0; rank < matches.length; rank++) {
      const match = matches[rank]!;
      const contribution = weight / (rrfK + rank + 1);
      const existing = scoreMap.get(match.id);
      if (existing) {
        existing.score += contribution;
      } else {
        scoreMap.set(match.id, { match, score: contribution });
      }
    }
  }

  return [...scoreMap.values()]
    .sort((left, right) => right.score - left.score)
    .map(({ match, score }) => ({ ...match, distance: 1 / score }));
};

interface RetrieveVectorMatchesPerVariantArgs {
  store: SemanticIndexStore;
  knnLimit: number;
  queryVariants: readonly string[];
  repository?: string;
  languages?: readonly SourceLanguageId[];
}

const retrieveVectorMatchesPerVariant = async ({
  store,
  knnLimit,
  queryVariants,
  repository,
  languages,
}: RetrieveVectorMatchesPerVariantArgs): Promise<QueryMatchSummary[][]> => {
  const { embeddings, errorMessage } = await embedTextsWithLanguageModel([...queryVariants]);
  if (isNotBlank(errorMessage)) {
    throw new Error(errorMessage);
  }
  if (embeddings.length !== queryVariants.length) {
    throw new Error(
      `Embedding batch size mismatch: expected ${queryVariants.length} vectors, got ${embeddings.length}`
    );
  }

  return embeddings.map((queryEmbedding) => {
    if (isNullish(queryEmbedding)) {
      throw new Error("Query embedding produced no vector");
    }
    return store.queryNearest({
      nResults: knnLimit,
      queryEmbedding,
      repository,
      languages,
    });
  });
};

interface ResolveInitialMatchesArgs {
  store: SemanticIndexStore;
  searchMode: SearchMode;
  queryText: string;
  knnLimit: number;
  queryVariants: readonly string[];
  repository?: string;
  languages?: readonly SourceLanguageId[];
}

const resolveInitialMatches = async ({
  store,
  searchMode,
  queryText,
  knnLimit,
  queryVariants,
  repository,
  languages,
}: ResolveInitialMatchesArgs): Promise<QueryMatchSummary[]> => {
  if (searchMode === "lexical") {
    return safeQueryLexicalChunks({ store, queryText, nResults: knnLimit, repository, languages });
  }

  const vectorLists = await retrieveVectorMatchesPerVariant({
    store,
    knnLimit,
    queryVariants,
    repository,
    languages,
  });

  const fusedVector = vectorLists.length === 1 ? vectorLists[0]! : fuseRankedListsWithEqualWeightRRF(vectorLists);

  if (searchMode === "vector") {
    return fusedVector;
  }

  const lexicalMatches = safeQueryLexicalChunks({ store, queryText, nResults: knnLimit, repository, languages });
  return fuseChunkMatchesWithRRF({ vectorMatches: fusedVector, lexicalMatches });
};

export const runWorkspaceSemanticQuery = async ({
  store,
  nResults,
  queryText,
  repository,
  languages,
  searchMode = "vector",
  useReranker = false,
  useMultiQuery = false,
}: RunWorkspaceSemanticQueryArgs): Promise<QueryOutcome> => {
  try {
    const knnLimit = resolveChunkFetchCountForFileConsolidation(nResults);
    const queryVariants = useMultiQuery ? await expandQueryVariants(queryText) : [queryText];

    const rawMatches = await resolveInitialMatches({
      store,
      searchMode,
      queryText,
      knnLimit,
      queryVariants,
      repository,
      languages,
    });

    const matches = useReranker ? await safeRerankWithCrossEncoder({ queryText, matches: rawMatches }) : rawMatches;

    return consolidateSemanticQueryMatchesByFile({ matches, nResults });
  } catch (queryErr: unknown) {
    const queryError = getErrorMessage(queryErr);
    console.error(`[runWorkspaceSemanticQuery]: query failed: ${queryError}`, queryErr);
    return { error: queryError };
  }
};
