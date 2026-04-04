import { getErrorMessage } from "@lichens-innovation/ts-common";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { access, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { buildMcpErrorResponse, buildMcpTextResponse } from "./mcp-server.utils";

const SKIP_DIR_NAMES = new Set(["node_modules", ".git"]);

export const listLocalGitProjectsInputSchema = z.object({
  parentDirectory: z
    .string()
    .min(1)
    .describe("Absolute or relative path to the parent folder to scan (e.g. /Users/me/src or ~/Projects)"),
});

export type ListLocalGitProjectsInput = z.infer<typeof listLocalGitProjectsInputSchema>;

export const listLocalGitProjects = async (input: ListLocalGitProjectsInput): Promise<CallToolResult> => {
  const { parentDirectory } = input;
  const { repos, error } = await listGitRepoRootsUnderParent(parentDirectory);
  if (error) {
    return buildMcpErrorResponse(error);
  }

  return buildMcpTextResponse(repos.join("\n"));
};

export type ListGitRepoRootsResult = {
  parentPath?: string;
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
  parentPath: string;
  dir: string;
  repos: string[];
}

const walkGitRepoRoots = async ({ parentPath, dir, repos }: WalkGitRepoRootsArgs): Promise<void> => {
  try {
    if (await hasGitDirectory(dir)) {
      repos.push(dir.replace(parentPath, ""));
      return;
    }

    const entries = await readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory() || SKIP_DIR_NAMES.has(ent.name)) {
        continue;
      }
      await walkGitRepoRoots({ parentPath, dir: join(dir, ent.name), repos });
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
  await walkGitRepoRoots({ parentPath, dir: root, repos });
  repos.sort();
  return {
    parentPath,
    repos,
  };
};
