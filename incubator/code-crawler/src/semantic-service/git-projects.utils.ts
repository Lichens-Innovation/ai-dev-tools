import { getErrorMessage } from "@lichens-innovation/ts-common";
import { access, readdir, stat } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { EnvNames, expandUserDirectory, getCodeCrawlerRoot } from "../utils/env.utils";

const SKIP_DIR_NAMES = new Set(["node_modules", ".git"]);

export interface ErrorResult {
  error: string;
}

export type ListGitRepoRootsResult = {
  parentPath?: string;
  repos: string[];
  error?: string;
};

const listGitRepoRootsFailure = (error: string): ListGitRepoRootsResult => ({
  repos: [],
  error,
});

const hasGitDirectory = async (dir: string): Promise<boolean> => {
  try {
    await access(join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
};

interface WalkGitRepoRootsArgs {
  parentRoot: string;
  dir: string;
  repos: string[];
}

const walkGitRepoRoots = async ({ parentRoot, dir, repos }: WalkGitRepoRootsArgs): Promise<void> => {
  try {
    if (await hasGitDirectory(dir)) {
      repos.push(relative(parentRoot, dir));
      return;
    }

    const entries = await readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory() || SKIP_DIR_NAMES.has(ent.name)) {
        continue;
      }
      await walkGitRepoRoots({ parentRoot, dir: join(dir, ent.name), repos });
    }
  } catch (e: unknown) {
    console.error(`[walkGitRepoRoots]: walk error on ${dir}: ${getErrorMessage(e)}`, e);
  }
};

/**
 * Lists Git repository root paths under `parentPath`, each relative to that directory.
 * Does not descend into a directory that is already a Git root (avoids submodules noise).
 */
export const listGitRepoRootsUnderParent = async (parentPath: string): Promise<ListGitRepoRootsResult> => {
  let root: string;

  try {
    root = resolve(expandUserDirectory(parentPath));
    const stats = await stat(root);
    if (!stats.isDirectory()) {
      return listGitRepoRootsFailure(`Not a directory: ${root}`);
    }
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    console.error(`[listGitRepoRootsUnderParent]: invalid parent path ${parentPath}: ${message}`, e);
    return listGitRepoRootsFailure(`Cannot access parent directory: ${message}`);
  }

  const repos: string[] = [];
  await walkGitRepoRoots({ parentRoot: root, dir: root, repos });

  return {
    parentPath,
    repos: repos.sort(),
  };
};

export type RepositoriesParentResult = {
  parentDirectory: string;
  repositoryCount: number;
  repositories: string[];
};

/** Absolute path to the directory set in {@link EnvNames.root} (after `~` expansion). */
export const resolveCodeCrawlerParentPath = (): string => resolve(expandUserDirectory(getCodeCrawlerRoot()));

type GetRepositoriesParentResourceType = { payload: RepositoriesParentResult } | ErrorResult;

/**
 * Uses `CODE_CRAWLER_ROOT`, then lists Git repository roots under that directory.
 */
export const getRepositoriesInfos = async (): Promise<GetRepositoriesParentResourceType> => {
  const parentDirectory = resolveCodeCrawlerParentPath();

  const { repos, error } = await listGitRepoRootsUnderParent(parentDirectory);
  if (error) {
    return { error };
  }

  const repositories = repos //
    .map((rel) => basename(resolve(parentDirectory, rel))) //
    .sort();

  return {
    payload: {
      parentDirectory,
      repositoryCount: repositories.length,
      repositories,
    },
  };
};

export type ResolveRepositoryUnderCodeCrawlerRootResult = { absolutePath: string; repository: string } | ErrorResult;

type BuildRepoNotFoundArgs = {
  trimmedRoot?: string;
  repository: string;
  parentDirectory: string;
};

const buildRepoNotFound = ({ trimmedRoot, repository, parentDirectory }: BuildRepoNotFoundArgs): ErrorResult => {
  const hint = trimmedRoot
    ? "Check rootDir and the repository basename, or run list-local-git-projects with that parent path."
    : "Use the workspace-repositories resource to list available repository folder names.";
  return {
    error: [`No Git repository named "${repository}" was found under ${parentDirectory}.`, hint].join("\n"),
  };
};

type BuildRepoMultipleMatchesArgs = {
  trimmedRoot?: string;
  repository: string;
  parentDirectory: string;
  matches: string[];
};

const buildRepoMultipleMatches = ({
  trimmedRoot,
  repository,
  parentDirectory,
  matches,
}: BuildRepoMultipleMatchesArgs): ErrorResult => {
  const hint = trimmedRoot
    ? "Rename one of the folders or use a narrower rootDir so only one match exists."
    : `Rename one of the folders or narrow ${EnvNames.root} so only one match exists.`;
  return {
    error: [
      `Multiple Git repositories named "${repository}" exist under ${parentDirectory}:`,
      ...matches.map((rel) => `- ${rel}`),
      hint,
    ].join("\n"),
  };
};

/**
 * Resolves a Git repository folder name under a parent directory (basename match).
 * When `rootDir` is omitted or blank, uses {@link EnvNames.root}.
 * Fails if the parent cannot be resolved, if no repo matches, or if several repos share the same basename.
 */
export const resolveRepositoryUnderCodeCrawlerRoot = async (
  repository: string,
  rootDir?: string
): Promise<ResolveRepositoryUnderCodeCrawlerRootResult> => {
  const trimmedRoot = rootDir?.trim();
  let parentDirectory: string | undefined;

  if (trimmedRoot) {
    try {
      parentDirectory = resolve(expandUserDirectory(trimmedRoot));
      const stats = await stat(parentDirectory);
      if (!stats.isDirectory()) {
        return { error: `rootDir is not a directory: ${parentDirectory}` };
      }
    } catch (e: unknown) {
      const message = getErrorMessage(e);
      console.error(`[resolveRepositoryUnderCodeCrawlerRoot]: invalid rootDir ${trimmedRoot}: ${message}`, e);
      return { error: `Cannot access rootDir: ${message}` };
    }
  } else {
    parentDirectory = resolveCodeCrawlerParentPath();
  }

  const { repos, error } = await listGitRepoRootsUnderParent(parentDirectory);
  if (error) {
    return { error };
  }

  const matches = repos.filter((rel) => basename(resolve(parentDirectory, rel)) === repository);

  if (matches.length === 0) {
    return buildRepoNotFound({ trimmedRoot, repository, parentDirectory });
  }

  if (matches.length > 1) {
    return buildRepoMultipleMatches({ trimmedRoot, repository, parentDirectory, matches });
  }

  return {
    absolutePath: resolve(parentDirectory, matches[0]),
    repository,
  };
};
