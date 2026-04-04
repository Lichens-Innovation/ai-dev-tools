import { getErrorMessage } from "@lichens-innovation/ts-common";
import { access, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const SKIP_DIR_NAMES = new Set(["node_modules", ".git"]);

export type ListGitRepoRootsResult = {
  repos: string[];
  error?: string;
};

const listGitRepoRootsFailure = (error: string): ListGitRepoRootsResult => ({
  repos: [],
  error,
});

const expandUserDirectory = (input: string): string => {
  const trimmed = input.trim();
  if (trimmed === "~") {
    return homedir();
  }

  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return join(homedir(), trimmed.slice(2));
  }

  return trimmed;
};

const hasGitDirectory = async (dir: string): Promise<boolean> => {
  try {
    await access(join(dir, ".git"));
    return true;
  } catch {
    return false;
  }
};

interface WalkGitRepoRootsArgs {
  dir: string;
  repos: string[];
}

const walkGitRepoRoots = async ({ dir, repos }: WalkGitRepoRootsArgs): Promise<void> => {
  try {
    if (await hasGitDirectory(dir)) {
      repos.push(dir);
      return;
    }

    const entries = await readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory() || SKIP_DIR_NAMES.has(ent.name)) {
        continue;
      }
      await walkGitRepoRoots({ dir: join(dir, ent.name), repos });
    }
  } catch (e: unknown) {
    console.error(`[walkGitRepoRoots]: walk error on ${dir}: ${getErrorMessage(e)}`, e);
  }
};

/**
 * Lists absolute paths of Git repository roots under `parentPath`.
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
  await walkGitRepoRoots({ dir: root, repos });
  repos.sort();
  return { repos };
};
