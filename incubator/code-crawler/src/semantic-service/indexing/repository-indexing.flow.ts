import { getErrorMessage, isNotBlank } from "@lichens-innovation/ts-common";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { expandUserDirectory } from "../../utils/env.utils";
import { listGitRepoRootsUnderParent, resolveCodeCrawlerParentPath } from "../../utils/git-repositories.utils";
import { EXAMPLE_QUERY_TEXT, runWorkspaceSemanticQuery } from "../search/workspace-semantic-query.service";
import type { FileIndexRecord } from "../types/index-domain.types";
import type { QueryOutcome } from "../types/search.types";
import type { SemanticIndexStore } from "../types/store.types";
import { tryCollectFileRecords } from "./repository-file-records.utils";
import { tryUpsertFileRecordsToSemanticIndex } from "./semantic-index-upsert.pipeline";

interface RunRepositoryIndexingFlowArgs {
  repoRoot: string;
  repository: string;
  store: SemanticIndexStore;
}

interface IndexRepositoryFlowOk {
  ok: true;
  indexedChunkCount: number;
  indexedFileCount: number;
  exampleMatches: QueryOutcome;
}

interface IndexRepositoryFlowFail {
  ok: false;
  result: CallToolResult;
}

type IndexRepositoryFlowOutcome = IndexRepositoryFlowOk | IndexRepositoryFlowFail;

interface UpsertRecordsAndRunExampleQueryOk {
  indexedChunkCount: number;
  ok: true;
  exampleMatches: QueryOutcome;
}

interface UpsertRecordsAndRunExampleQueryFail {
  ok: false;
  result: CallToolResult;
}

type UpsertRecordsAndRunExampleQueryOutcome = UpsertRecordsAndRunExampleQueryOk | UpsertRecordsAndRunExampleQueryFail;

interface UpsertRecordsAndRunExampleQueryArgs {
  records: FileIndexRecord[];
  repository: string;
  store: SemanticIndexStore;
}

const upsertRecordsAndRunExampleQuery = async ({
  records,
  repository,
  store,
}: UpsertRecordsAndRunExampleQueryArgs): Promise<UpsertRecordsAndRunExampleQueryOutcome> => {
  const upsertOutcome = await tryUpsertFileRecordsToSemanticIndex({ records, repository, store });
  if (!upsertOutcome.ok) {
    return { ok: false, result: upsertOutcome.result };
  }

  const exampleMatches = await runWorkspaceSemanticQuery({
    store,
    nResults: 5,
    queryText: EXAMPLE_QUERY_TEXT,
    repository,
  });
  return { indexedChunkCount: upsertOutcome.indexedChunkCount, ok: true, exampleMatches };
};

export const runRepositoryIndexingFlow = async ({
  repoRoot,
  repository,
  store,
}: RunRepositoryIndexingFlowArgs): Promise<IndexRepositoryFlowOutcome> => {
  const collected = await tryCollectFileRecords({ repoRoot, repository });

  if (!collected.ok) {
    return { ok: false, result: collected.result };
  }

  const { records } = collected;
  if (records.length === 0) {
    return { indexedChunkCount: 0, indexedFileCount: 0, ok: true, exampleMatches: [] };
  }

  const indexed = await upsertRecordsAndRunExampleQuery({ records, repository, store });
  if (!indexed.ok) {
    return { ok: false, result: indexed.result };
  }

  return {
    indexedChunkCount: indexed.indexedChunkCount,
    indexedFileCount: records.length,
    ok: true,
    exampleMatches: indexed.exampleMatches,
  };
};

export interface ResolveParentDirectoryForSemanticWorkspaceOk {
  parentDirectory: string;
}

export interface ResolveParentDirectoryForSemanticWorkspaceError {
  error: string;
}

export type ResolveParentDirectoryForSemanticWorkspaceOutcome =
  | ResolveParentDirectoryForSemanticWorkspaceOk
  | ResolveParentDirectoryForSemanticWorkspaceError;

export const resolveParentDirectoryForSemanticWorkspace = async (
  rootDir?: string
): Promise<ResolveParentDirectoryForSemanticWorkspaceOutcome> => {
  const trimmedRoot = rootDir?.trim();

  if (trimmedRoot) {
    try {
      const parentDirectory = resolve(expandUserDirectory(trimmedRoot));
      const stats = await stat(parentDirectory);
      if (!stats.isDirectory()) {
        return { error: `rootDir is not a directory: ${parentDirectory}` };
      }
      return { parentDirectory };
    } catch (e: unknown) {
      const errorMessage = getErrorMessage(e);
      console.error(`[resolveParentDirectoryForSemanticWorkspace]: invalid rootDir ${trimmedRoot}: ${errorMessage}`, e);
      return { error: `Cannot access rootDir: ${errorMessage}` };
    }
  }

  return { parentDirectory: resolveCodeCrawlerParentPath() };
};

export const textFromCallToolResult = (result: CallToolResult): string => {
  const block = result.content[0];
  if (block?.type === "text" && typeof block.text === "string") {
    return block.text;
  }

  return "Indexing failed (no message)";
};

export interface RepoPrepareOk {
  ok: true;
  indexedChunkCount: number;
  indexedFileCount: number;
  repository: string;
}

export interface RepoPrepareFail {
  ok: false;
  error: string;
  repository: string;
}

export type RepoPrepareResult = RepoPrepareOk | RepoPrepareFail;

export interface RunWorkspaceRepositoriesIndexingArgs {
  parentDirectory: string;
  store: SemanticIndexStore;
}

export interface RunWorkspaceRepositoriesIndexingError {
  error: string;
}

export interface RunWorkspaceRepositoriesIndexingOk {
  perRepoResults: RepoPrepareResult[];
  repos: string[];
}

export type RunWorkspaceRepositoriesIndexingOutcome =
  | RunWorkspaceRepositoriesIndexingError
  | RunWorkspaceRepositoriesIndexingOk;

export const runWorkspaceRepositoriesIndexing = async ({
  parentDirectory,
  store,
}: RunWorkspaceRepositoriesIndexingArgs): Promise<RunWorkspaceRepositoriesIndexingOutcome> => {
  const { repos, error } = await listGitRepoRootsUnderParent(parentDirectory);
  if (isNotBlank(error)) {
    return { error };
  }

  const perRepoResults: RepoPrepareResult[] = [];

  for (const rel of repos) {
    const repoRoot = resolve(parentDirectory, rel);
    const repository = rel.split(/[/\\]/).join("/");

    const flowOutcome = await runRepositoryIndexingFlow({ repoRoot, repository, store });
    if (!flowOutcome.ok) {
      perRepoResults.push({ repository, ok: false, error: textFromCallToolResult(flowOutcome.result) });
      continue;
    }

    perRepoResults.push({
      repository,
      ok: true,
      indexedChunkCount: flowOutcome.indexedChunkCount,
      indexedFileCount: flowOutcome.indexedFileCount,
    });
  }

  return { perRepoResults, repos };
};
