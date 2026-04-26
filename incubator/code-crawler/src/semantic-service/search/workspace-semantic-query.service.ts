import { getErrorMessage, isNotBlank, isNullish } from "@lichens-innovation/ts-common";
import { embedTextsWithLanguageModel } from "../language-model-embedding.pipeline";
import type { QueryMatchSummary, QueryOutcome } from "../types/search.types";
import type { SemanticIndexStore } from "../types/store.types";
import type { SourceLanguageId } from "../types/source-language.types";
import { fuseChunkMatchesWithRRF } from "./hybrid-chunk-fusion.utils";
import { rerankWithCrossEncoder } from "./cross-encoder-rerank.utils";
import {
  consolidateSemanticQueryMatchesByFile,
  resolveChunkFetchCountForFileConsolidation,
} from "./match-consolidation-by-file.utils";

export const EXAMPLE_QUERY_TEXT = "tanstack query returning a list of items with an infinite staleTime";

interface RunWorkspaceSemanticQueryArgs {
  store: SemanticIndexStore;
  nResults: number;
  queryText: string;
  repository?: string;
  languages?: readonly SourceLanguageId[];
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
    console.warn(`[safeQueryLexicalChunks] lexical search skipped (vector-only): ${msg}`);
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

export const runWorkspaceSemanticQuery = async ({
  store,
  nResults,
  queryText,
  repository,
  languages,
}: RunWorkspaceSemanticQueryArgs): Promise<QueryOutcome> => {
  const { embeddings, errorMessage } = await embedTextsWithLanguageModel([queryText]);

  if (isNotBlank(errorMessage)) {
    return { error: errorMessage };
  }

  const queryEmbedding = embeddings[0];
  if (isNullish(queryEmbedding)) {
    return { error: "Query embedding produced no vector" };
  }

  try {
    const knnLimit = resolveChunkFetchCountForFileConsolidation(nResults);

    const vectorMatches: QueryMatchSummary[] = store.queryNearest({
      nResults: knnLimit,
      queryEmbedding,
      repository,
      languages,
    });

    const lexicalMatches: QueryMatchSummary[] = safeQueryLexicalChunks({
      store,
      queryText,
      nResults: knnLimit,
      repository,
      languages,
    });

    const matches: QueryMatchSummary[] = fuseChunkMatchesWithRRF({ lexicalMatches, vectorMatches });
    const rerankedMatches: QueryMatchSummary[] = await safeRerankWithCrossEncoder({ queryText, matches });

    return consolidateSemanticQueryMatchesByFile({ matches: rerankedMatches, nResults });
  } catch (e: unknown) {
    const queryError = getErrorMessage(e);
    console.error(`[runWorkspaceSemanticQuery]: query failed: ${queryError}`, e);
    return { error: queryError };
  }
};
