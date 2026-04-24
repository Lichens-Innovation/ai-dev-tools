import "dotenv/config";
import { getErrorMessage, isNotBlank } from "@lichens-innovation/ts-common";
import { Command } from "commander";
import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

import { EnvNames, expandUserDirectory, readOptionalTrimmedEnvVar } from "../src/utils/env.utils";
import { listGitRepoRootsUnderParent } from "../src/utils/git-repositories.utils";

const DEFAULT_WORKSPACE_ROOT = path.join(homedir(), "git", "lichens");
const LOG_PREFIX = "[pull-workspace-repositories]";

interface PullWorkspaceRepositoriesCliOpts {
  root?: string;
}

interface GitFfOnlyPullOutcome {
  isSuccess: boolean;
  summary: string;
}

interface ResolveWorkspaceParentInputArgs {
  cliRoot?: string;
  envRoot: string;
}

const resolveWorkspaceParentInput = ({ cliRoot, envRoot }: ResolveWorkspaceParentInputArgs): string => {
  if (isNotBlank(cliRoot)) {
    return cliRoot.trim();
  }

  if (isNotBlank(envRoot)) {
    return envRoot;
  }

  return DEFAULT_WORKSPACE_ROOT;
};

interface TruncateArgs {
  value: string;
  maxLength: number;
}

const truncate = ({ value, maxLength }: TruncateArgs): string => {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength)}…`;
};

const summarizeFfOnlyPullResult = (result: SpawnSyncReturns<string>): GitFfOnlyPullOutcome => {
  if (result.status === 0) {
    const message = isNotBlank(result.stdout) ? result.stdout.trim() : "(up to date)";
    return { isSuccess: true, summary: truncate({ value: message, maxLength: 200 }) };
  }

  const source = result.stderr ?? result.stdout;
  const fallbackMessage = `exit ${result.status ?? "?"}`;
  const message = isNotBlank(source) ? source.trim() : fallbackMessage;
  return { isSuccess: false, summary: truncate({ value: message, maxLength: 400 }) };
};

const runGitFfOnlyPull = (cwd: string): GitFfOnlyPullOutcome => {
  const result = spawnSync("git", ["pull", "--ff-only"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  return summarizeFfOnlyPullResult(result);
};

const main = async (): Promise<void> => {
  const program = new Command();
  program
    .name("pull-workspace-repositories")
    .description("Run git pull --ff-only in each Git repository under CODE_CRAWLER_ROOT (or --root).")
    .option("--root <path>", "parent directory of Git repos (~ allowed); overrides CODE_CRAWLER_ROOT")
    .parse(process.argv);

  const opts = program.opts<PullWorkspaceRepositoriesCliOpts>();
  const fromEnv = readOptionalTrimmedEnvVar(EnvNames.root);
  const parentInput = resolveWorkspaceParentInput({ cliRoot: opts.root, envRoot: fromEnv });
  const parentResolved = path.resolve(expandUserDirectory(parentInput));

  console.info(`${LOG_PREFIX} parent: ${parentResolved}`);

  const { repos, error } = await listGitRepoRootsUnderParent(parentInput);
  if (error) {
    console.error(`${LOG_PREFIX} ${error}`);
    process.exit(1);
  }

  if (repos.length === 0) {
    console.info(`${LOG_PREFIX} No Git repositories found.`);
    return;
  }
  let hasPullFailures = false;

  for (const rel of repos) {
    const cwd = path.resolve(parentResolved, rel);
    const label = isNotBlank(rel) ? rel : ".";
    const outcome = runGitFfOnlyPull(cwd);

    if (outcome.isSuccess) {
      console.info(`${LOG_PREFIX} OK ${label}: ${outcome.summary}`);
      continue;
    }

    hasPullFailures = true;
    console.error(`${LOG_PREFIX} FAIL ${label}: ${outcome.summary}`);
  }

  if (hasPullFailures) {
    process.exit(1);
  }
};

void main().catch((err: unknown) => {
  console.error(`${LOG_PREFIX} ${getErrorMessage(err)}`, err);
  process.exit(1);
});
