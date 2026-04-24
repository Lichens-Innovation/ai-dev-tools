import { isNotBlank } from "@lichens-innovation/ts-common";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { z } from "zod";
import { buildMcpErrorResponse, buildMcpTextResponse } from "../mcp/mcp-server.utils";
import { toString } from "../utils/arrays.utils";
import { resolveRepositoryUnderCodeCrawlerRoot } from "../utils/git-repositories.utils";
import { generateRagAnswerFromMatches } from "./code-rag-text.pipeline";
import { getIndexedFileContentByFileId as getIndexedFileContentByFileIdWithStore } from "./indexing/indexed-file-content.utils";
import {
  resolveParentDirectoryForSemanticWorkspace,
  runRepositoryIndexingFlow,
  runWorkspaceRepositoriesIndexing,
} from "./indexing/repository-indexing.flow";
import { WORKSPACE_REPOSITORIES_FILES_COLLECTION } from "./indexing/workspace-semantic.constants";
import { workspaceSemanticIndexStore } from "./persistence/sqlite/sqlite-semantic-index.store";
import { EXAMPLE_QUERY_TEXT, runWorkspaceSemanticQuery } from "./search/workspace-semantic-query.service";
import type { QueryOutcome } from "./types/search.types";
import type { SourceLanguageId } from "./types/source-language.types";
import { SOURCE_LANGUAGE_IDS } from "./types/source-language.types";

export type { GetIndexedFileContentOutcome, IndexedFileContentPayload } from "./indexing/indexed-file-content.utils";

const MAX_SEMANTIC_SEARCH_NB_RESULTS = 50;

export const prepareRepositoryForSemanticSearchInputSchema = z.object({
  repository: z
    .string()
    .min(1)
    .describe(
      toString([
        "Git repository folder name (directory basename) under the parent directory",
        "(rootDir when provided, otherwise CODE_CRAWLER_ROOT); must match names from the",
        "workspace-repositories resource when using the default root.",
      ])
    ),
  rootDir: z
    .string()
    .optional()
    .describe(
      toString([
        "Optional path to the directory that contains Git repositories",
        "(~ expansion supported). When omitted, CODE_CRAWLER_ROOT is used.",
      ])
    ),
});

export type PrepareRepositoryForSemanticSearchInput = z.infer<typeof prepareRepositoryForSemanticSearchInputSchema>;

export const prepareWorkspaceRepositoriesForSemanticSearchInputSchema = z.object({
  rootDir: z
    .string()
    .optional()
    .describe(
      toString([
        "Optional path to the directory that contains Git repositories",
        "(~ expansion supported). When omitted, CODE_CRAWLER_ROOT is used",
        "(same default as prepare-repository-for-semantic-search).",
      ])
    ),
});

export type PrepareWorkspaceRepositoriesForSemanticSearchInput = z.infer<
  typeof prepareWorkspaceRepositoriesForSemanticSearchInputSchema
>;

export const semanticSearchWorkspaceFilesInputSchema = z.object({
  queryText: z
    .string()
    .min(1)
    .describe(
      toString([
        "Natural-language search query; embedded and matched against indexed",
        "source chunks aligned with the abstract syntax tree (AST) via tree-sitter,",
        "e.g. per-symbol regions—not arbitrary line windows or whole-file blobs.",
        "Each chunk carries intra-file calls/calledBy hints and a path prefix for retrieval context.",
      ])
    ),
  nbResults: z
    .number()
    .int()
    .positive()
    .max(MAX_SEMANTIC_SEARCH_NB_RESULTS)
    .optional()
    .default(10)
    .describe(
      toString([
        `Maximum number of distinct files to return (default 10, max ${MAX_SEMANTIC_SEARCH_NB_RESULTS});`,
        "each row is one file with the strongest matching chunk as preview;",
        "multi-chunk agreement boosts ranking (lower effective distance).",
      ])
    ),
  repository: z
    .string()
    .min(1)
    .optional()
    .describe(
      toString([
        "Optional repository folder name (metadata filter, same basename as",
        "prepare-repository-for-semantic-search). When omitted, search runs across",
        "all indexed repositories.",
      ])
    ),
  languages: z
    .array(z.enum(SOURCE_LANGUAGE_IDS))
    .optional()
    .default([])
    .describe(
      toString([
        "Optional list of source languages to restrict hits (same ids as indexing:",
        `${SOURCE_LANGUAGE_IDS.join(", ")}). Empty = all languages.`,
      ])
    ),
});

export type SemanticSearchWorkspaceFilesInput = z.infer<typeof semanticSearchWorkspaceFilesInputSchema>;

export const clearWorkspaceSemanticSearchIndexInputSchema = z.object({}).default({});

export type ClearWorkspaceSemanticSearchIndexInput = z.infer<typeof clearWorkspaceSemanticSearchIndexInputSchema>;

export const getIndexedFileContentByFileIdQuerySchema = z.object({
  fileId: z.string().min(1).describe("Stable file id from semantic search hits (repository::path)."),
});

export type GetIndexedFileContentByFileIdQuery = z.infer<typeof getIndexedFileContentByFileIdQuerySchema>;

export const getIndexedFileContentByFileId = async (fileId: string) =>
  getIndexedFileContentByFileIdWithStore({ store: workspaceSemanticIndexStore, fileId });

interface BuildPrepareRepositoryForSemanticSearchSuccessResponseArgs {
  exampleMatches: QueryOutcome;
  indexedChunkCount: number;
  indexedFileCount: number;
  repository: string;
  skippedUnchangedFileCount: number;
}

const buildPrepareRepositoryForSemanticSearchSuccessResponse = ({
  exampleMatches,
  indexedChunkCount,
  indexedFileCount,
  repository,
  skippedUnchangedFileCount,
}: BuildPrepareRepositoryForSemanticSearchSuccessResponseArgs): CallToolResult => {
  const payload = {
    collectionName: WORKSPACE_REPOSITORIES_FILES_COLLECTION,
    exampleQuery: {
      matches: exampleMatches,
      queryText: EXAMPLE_QUERY_TEXT,
    },
    indexedChunkCount,
    indexedFileCount,
    repository,
    skippedUnchangedFileCount,
  };

  return buildMcpTextResponse(JSON.stringify(payload, null, 2));
};

export const prepareRepositoryForSemanticSearch = async (
  input: PrepareRepositoryForSemanticSearchInput
): Promise<CallToolResult> => {
  const { repository, rootDir } = input;

  const resolved = await resolveRepositoryUnderCodeCrawlerRoot(repository, rootDir);
  if ("error" in resolved) {
    return buildMcpErrorResponse(resolved.error);
  }

  const flowOutcome = await runRepositoryIndexingFlow({
    repoRoot: resolved.absolutePath,
    repository,
    store: workspaceSemanticIndexStore,
  });
  if (!flowOutcome.ok) {
    return flowOutcome.result;
  }

  const { exampleMatches, indexedChunkCount, indexedFileCount, skippedUnchangedFileCount } = flowOutcome;
  return buildPrepareRepositoryForSemanticSearchSuccessResponse({
    exampleMatches,
    indexedChunkCount,
    indexedFileCount,
    repository,
    skippedUnchangedFileCount,
  });
};

export const prepareWorkspaceRepositoriesForSemanticSearch = async (
  input: PrepareWorkspaceRepositoriesForSemanticSearchInput
): Promise<CallToolResult> => {
  const { rootDir } = input;

  const parentResolved = await resolveParentDirectoryForSemanticWorkspace(rootDir);
  if ("error" in parentResolved) {
    return buildMcpErrorResponse(parentResolved.error);
  }
  const { parentDirectory } = parentResolved;

  const indexingOutcome = await runWorkspaceRepositoriesIndexing({
    parentDirectory,
    store: workspaceSemanticIndexStore,
  });
  if ("error" in indexingOutcome) {
    return buildMcpErrorResponse(indexingOutcome.error);
  }

  const { perRepoResults, repos } = indexingOutcome;

  const preparedCount = perRepoResults.filter((r) => r.ok).length;
  const failedCount = perRepoResults.filter((r) => !r.ok).length;
  const indexedFileCount = perRepoResults.reduce((sum, r) => sum + (r.ok ? r.indexedFileCount : 0), 0);
  const indexedChunkCount = perRepoResults.reduce((sum, r) => sum + (r.ok ? r.indexedChunkCount : 0), 0);
  const skippedUnchangedFileCount = perRepoResults.reduce(
    (sum, r) => sum + (r.ok ? r.skippedUnchangedFileCount : 0),
    0
  );

  const exampleMatches = await runWorkspaceSemanticQuery({
    store: workspaceSemanticIndexStore,
    nResults: 5,
    queryText: EXAMPLE_QUERY_TEXT,
  });

  const payload = {
    collectionName: WORKSPACE_REPOSITORIES_FILES_COLLECTION,
    exampleQuery: { matches: exampleMatches, queryText: EXAMPLE_QUERY_TEXT },
    parentDirectory,
    repositories: perRepoResults,
    totals: {
      failedCount,
      indexedChunkCount,
      indexedFileCount,
      preparedCount,
      repositoryCount: repos.length,
      skippedUnchangedFileCount,
    },
  };

  return buildMcpTextResponse(JSON.stringify(payload, null, 2));
};

export const semanticSearchWorkspaceFiles = async (
  input: SemanticSearchWorkspaceFilesInput
): Promise<CallToolResult> => {
  const { nbResults, queryText, repository, languages } = input;

  const outcome = await runWorkspaceSemanticQuery({
    store: workspaceSemanticIndexStore,
    nResults: nbResults,
    queryText,
    repository,
    languages: languages as readonly SourceLanguageId[],
  });

  return buildMcpTextResponse(JSON.stringify({ queryText, outcome }, null, 2));
};

interface RespondArgs {
  queryText: string;
  outcome: QueryOutcome;
  ragResponse: string;
}
const respond = ({ queryText, outcome, ragResponse }: RespondArgs): CallToolResult =>
  buildMcpTextResponse(JSON.stringify({ queryText, outcome, ragResponse }, null, 2));

export const semanticSearchWorkspaceFilesWithRag = async (
  input: SemanticSearchWorkspaceFilesInput
): Promise<CallToolResult> => {
  const { nbResults, queryText, repository, languages } = input;

  const outcome = await runWorkspaceSemanticQuery({
    store: workspaceSemanticIndexStore,
    nResults: nbResults,
    queryText,
    repository,
    languages: languages as readonly SourceLanguageId[],
  });

  if (!Array.isArray(outcome)) {
    return respond({ queryText, outcome, ragResponse: "Semantic search failed; text generation was skipped." });
  }
  if (outcome.length === 0) {
    return respond({ queryText, outcome, ragResponse: "No matching indexed chunks were found for this query." });
  }

  const { ragResponse: generated, errorMessage } = await generateRagAnswerFromMatches({
    matches: outcome,
    question: queryText,
  });
  const ragResponse = isNotBlank(errorMessage) ? `Text generation failed: ${errorMessage}` : generated;

  return respond({ queryText, outcome, ragResponse });
};

export const clearWorkspaceSemanticSearchIndex = async (): Promise<CallToolResult> => {
  workspaceSemanticIndexStore.clear();
  return buildMcpTextResponse("Workspace semantic index cleared");
};
