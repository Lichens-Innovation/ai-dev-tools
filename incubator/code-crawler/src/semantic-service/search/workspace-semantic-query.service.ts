import { getErrorMessage, isNotBlank, isNullish } from "@lichens-innovation/ts-common";
import { embedTextsWithLanguageModel } from "../language-model-embedding.pipeline";
import type { QueryOutcome } from "../types/search.types";
import type { SemanticIndexStore } from "../types/store.types";
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
    const matches = store.queryNearest({
      nResults: resolveChunkFetchCountForFileConsolidation(nResults),
      queryEmbedding,
      repository,
    });

    return consolidateSemanticQueryMatchesByFile({ matches, nResults });
  } catch (e: unknown) {
    const queryError = getErrorMessage(e);
    console.error(`[runWorkspaceSemanticQuery]: query failed: ${queryError}`, e);
    return { error: queryError };
  }
};
