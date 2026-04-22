import { getErrorMessage, isNotBlank, isNullish } from "@lichens-innovation/ts-common";
import { embedTextsWithLanguageModel } from "../language-model-embedding.pipeline";
import type { QueryMatchSummary, QueryOutcome } from "../types/search.types";
import type { SemanticIndexStore } from "../types/store.types";
import { fuseHybridChunkMatches } from "./hybrid-chunk-fusion.utils";
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
}

export const runWorkspaceSemanticQuery = async ({
  store,
  nResults,
  queryText,
  repository,
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

    const vectorMatches = store.queryNearest({ nResults: knnLimit, queryEmbedding, repository });

    let lexicalMatches: QueryMatchSummary[] = [];
    try {
      lexicalMatches = store.queryLexicalChunks({
        queryText,
        nResults: knnLimit,
        repository,
      });
    } catch (lexErr: unknown) {
      const msg = getErrorMessage(lexErr);
      console.warn(`[runWorkspaceSemanticQuery] lexical search skipped (vector-only): ${msg}`);
    }

    const matches = fuseHybridChunkMatches({ lexicalMatches, vectorMatches });
    return consolidateSemanticQueryMatchesByFile({ matches, nResults });
  } catch (e: unknown) {
    const queryError = getErrorMessage(e);
    console.error(`[runWorkspaceSemanticQuery]: query failed: ${queryError}`, e);
    return { error: queryError };
  }
};
