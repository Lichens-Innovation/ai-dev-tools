// Usage stats — the one place in this app where the tool that answers a question may be
// DOWNLOADED FROM THE NETWORK, and the decision about that.
//
// ┌─ THE DECISION ─────────────────────────────────────────────────────────────────────────────┐
// │ help-server ran `npx --yes ccusage@latest <view> --json` on every view of its Stats tab.    │
// │ Three properties of that survived the move only after being changed:                        │
// │                                                                                             │
// │  1. **A local copy wins.** `ccusage` on PATH, in the open project's `node_modules/.bin`, or  │
// │     in any of the directories a GUI-launched app cannot see from PATH alone, is used as-is.  │
// │     Most machines that care about token spend already have it, and the fast path is also     │
// │     the one that touches no network at all.                                                  │
// │  2. **A remote fetch is PINNED.** `@latest` means the app's behaviour changes without the    │
// │     app changing: a release published this afternoon runs on the user's machine tonight,     │
// │     with output this code has never seen and a supply chain nobody reviewed. The version is  │
// │     a constant in this file, so upgrading it is a diff.                                      │
// │  3. **It is shown first.** `previewUsageStats` spawns nothing and returns the exact argv     │
// │     plus `network: true/false`; `runUsageStats` accepts only a token that preview issued.    │
// │     So "the user was told a package would be fetched and executed" is a property of the      │
// │     wiring, not of the UI remembering to mention it.                                         │
// │                                                                                             │
// │ What was NOT done, and why: the fetch was not removed outright. ccusage reads `~/.claude`'s  │
// │ own JSONL and reimplementing it here would be a second parser of someone else's file format, │
// │ drifting silently. It was also not vendored — a dependency of the app is a dependency the    │
// │ app ships, and a user who does not open this tab should not carry it.                        │
// └─────────────────────────────────────────────────────────────────────────────────────────────┘
//
// The preview/run split mirrors the `claude -p` bridge and shares its token store, with one
// difference worth knowing: `claude-preview.ts` is provably unable to spawn (its import graph is
// walked by a test), while preview and run live together here. The guarantee that matters is the
// same either way — run takes a token and nothing else — and the token carries a `purpose`, so a
// stats token cannot be handed to `claude:run` and a Claude token cannot be spent here.

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { claudeChildPath, claudeSearchDirs, type ResolveOptions } from "./claude-cli.js";
import { claimInvocation, issueInvocation } from "./claude-tokens.js";
import type {
  CcusageSource,
  UsageStats,
  UsageStatsPreview,
  UsageStatsResult,
  UsageStatsView,
  UsageTotals,
} from "./contracts.js";

export type { CcusageSource, UsageStats, UsageStatsPreview, UsageStatsResult, UsageStatsView };

/**
 * The version fetched when no local copy exists. **Pinned deliberately — never `@latest`.**
 *
 * Bumping it is a code change, which is the point: the output shape `reduce()` below reads is an
 * assumption about a specific release, and a floating tag would let that assumption break between
 * two launches of the same build. When you raise this, re-read `reduce()` against the new
 * `--json` output.
 */
export const PINNED_CCUSAGE_VERSION = "20.0.19";

/** How long a run may take before it is abandoned. An npx fetch on a slow link is the long case. */
const RUN_TIMEOUT_MS = 90_000;

/** Plenty for `--json` over a year of usage, and a bound on what a runaway tool can hand back. */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

const ZERO: UsageTotals = { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 };

/** An empty answer — what every view shows before it has been asked, and when ccusage has no rows. */
export function emptyUsageStats(view: UsageStatsView): UsageStats {
  return {
    view,
    entryCount: 0,
    latestLabel: "",
    latest: { ...ZERO },
    total: { ...ZERO },
    activeBlocks: 0,
    recent: null,
    lastUpdated: "",
  };
}

/** Where `ccusage` (and `npx`) were found, and everywhere that was looked. */
export interface CcusageCli {
  source: CcusageSource;
  /** Absolute path of the local `ccusage`, or of `npx` when that is the fallback. */
  bin: string | null;
  searched: string[];
}

function isExecutable(file: string, platform: NodeJS.Platform): boolean {
  try {
    if (!fs.statSync(file).isFile()) return false;
    // The permission bit matters for the same reason it does in claude-cli.ts: a non-executable
    // file reported as available becomes an EACCES at spawn time, which is precisely what
    // resolving up front exists to avoid.
    if (platform !== "win32") fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function names(base: string, platform: NodeJS.Platform): string[] {
  return platform === "win32" ? [`${base}.cmd`, `${base}.exe`, `${base}.bat`, base] : [base];
}

function findIn(dirs: string[], base: string, platform: NodeJS.Platform): string | null {
  for (const dir of dirs) {
    for (const name of names(base, platform)) {
      const candidate = path.join(dir, name);
      if (isExecutable(candidate, platform)) return candidate;
    }
  }
  return null;
}

/**
 * Where a usable `ccusage` is, in preference order, or the list of places it isn't.
 *
 * The project's own `node_modules/.bin` comes first: a repo that has pinned ccusage as a
 * devDependency has already made this decision, and its pin should beat both PATH and ours. After
 * that it is the same expanded directory list the `claude` CLI is resolved against — a
 * GUI-launched app's PATH is not the user's PATH, and `~/.local/bin` and the version managers are
 * invisible to it (see `claude-cli.ts`, which explains the failure in full).
 *
 * NOTHING HERE SPAWNS. Availability is `fs`, so the "not installed" message can be written while
 * the Run button is still un-pressed rather than recovered from an ENOENT.
 */
export function resolveCcusage(projectRoot: string, opts: ResolveOptions = {}): CcusageCli {
  const platform = opts.platform ?? process.platform;
  const searched = [
    ...(projectRoot ? [path.join(projectRoot, "node_modules", ".bin")] : []),
    ...claudeSearchDirs(opts),
  ];

  const local = findIn(searched, "ccusage", platform);
  if (local) return { source: "local", bin: local, searched };

  const npx = findIn(searched, "npx", platform);
  if (npx) return { source: "npx", bin: npx, searched };

  return { source: "none", bin: null, searched };
}

/** Exactly what would be spawned for a resolution and a view. Pure. */
export function ccusageArgv(cli: CcusageCli, view: UsageStatsView): string[] {
  if (cli.source === "local") return [cli.bin!, view, "--json"];
  if (cli.source === "npx") {
    // `--yes` so the fetch does not stop on npx's interactive "install?" prompt, which a headless
    // child has nobody to answer. `--silent` because npm's own chatter goes to stdout and would
    // land inside the JSON we are about to parse.
    return [cli.bin!, "--silent", "--yes", `ccusage@${PINNED_CCUSAGE_VERSION}`, view, "--json"];
  }
  return [];
}

/** What the UI says when nothing can run — names the tool and how to get it, never "ENOENT". */
export function ccusageNotFoundMessage(cli: CcusageCli): string {
  return (
    "Usage stats need the `ccusage` tool, and neither it nor `npx` was found. Looked in " +
    `${cli.searched.length} directories, including ${cli.searched.slice(0, 3).join(", ")}. ` +
    "Install it with `npm i -g ccusage`, or add it to this project."
  );
}

/**
 * Build the invocation the Stats tab shows, and authorise it. Spawns nothing.
 *
 * `network` is the field this whole channel exists for: true means pressing Run downloads
 * `ccusage@<pinned>` from npm and executes it, and the UI has to say so in those words.
 */
export function previewUsageStats(
  projectRoot: string,
  view: UsageStatsView,
  opts: ResolveOptions = {}
): UsageStatsPreview {
  const cli = resolveCcusage(projectRoot, opts);
  const argv = ccusageArgv(cli, view);
  // ccusage reads `~/.claude`, not the repo, so the cwd only decides where a local install is
  // resolved from. The open project when there is one; the app's own directory otherwise.
  const cwd = projectRoot || process.cwd();

  if (cli.source === "none") {
    return {
      token: null,
      view,
      source: "none",
      argv: [],
      cwd,
      network: false,
      pinnedVersion: PINNED_CCUSAGE_VERSION,
      bin: null,
      searched: cli.searched,
      unavailable: ccusageNotFoundMessage(cli),
      expiresAt: 0,
    };
  }

  const invocation = issueInvocation({
    purpose: "usage-stats",
    bin: argv[0],
    args: argv.slice(1),
    cwd,
    prompt: "",
  });

  return {
    token: invocation.token,
    view,
    source: cli.source,
    argv,
    cwd,
    network: cli.source === "npx",
    pinnedVersion: PINNED_CCUSAGE_VERSION,
    bin: cli.source === "local" ? cli.bin : null,
    searched: cli.searched,
    unavailable: null,
    expiresAt: invocation.expiresAt,
  };
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

const sum = (rows: UsageTotals[]): UsageTotals =>
  rows.reduce(
    (acc, r) => ({
      inputTokens: acc.inputTokens + r.inputTokens,
      outputTokens: acc.outputTokens + r.outputTokens,
      totalTokens: acc.totalTokens + r.totalTokens,
      costUsd: acc.costUsd + r.costUsd,
    }),
    { ...ZERO }
  );

interface Row {
  label: string;
  /** ISO date, for `lastUpdated` and for sorting newest-first. */
  sortKey: string;
  active: boolean;
  totals: UsageTotals;
}

/** The array a view's `--json` puts its rows in, and how to read one. */
function rowsFor(view: UsageStatsView, data: Record<string, unknown>): Row[] | null {
  const arrayAt = (key: string): Record<string, unknown>[] | null => {
    const value = data?.[key];
    return Array.isArray(value) ? (value as Record<string, unknown>[]) : null;
  };

  switch (view) {
    case "daily": {
      const raw = arrayAt("daily");
      return (
        raw?.map((d) => ({
          label: String(d.date ?? ""),
          sortKey: String(d.date ?? ""),
          active: false,
          totals: {
            inputTokens: num(d.inputTokens),
            outputTokens: num(d.outputTokens),
            totalTokens: num(d.totalTokens),
            costUsd: num(d.totalCost),
          },
        })) ?? null
      );
    }
    case "session": {
      const raw = arrayAt("sessions");
      return (
        raw?.map((s) => ({
          label: String(s.sessionId ?? ""),
          sortKey: String(s.lastActivity ?? ""),
          active: false,
          totals: {
            inputTokens: num(s.inputTokens),
            outputTokens: num(s.outputTokens),
            totalTokens: num(s.totalTokens),
            costUsd: num(s.totalCost),
          },
        })) ?? null
      );
    }
    case "blocks": {
      const raw = arrayAt("blocks");
      return (
        raw?.map((b) => {
          const counts = (b.tokenCounts ?? {}) as Record<string, unknown>;
          return {
            label: String(b.startTime ?? ""),
            sortKey: String(b.startTime ?? ""),
            active: b.isActive === true,
            totals: {
              inputTokens: num(counts.inputTokens),
              outputTokens: num(counts.outputTokens),
              totalTokens: num(b.totalTokens),
              costUsd: num(b.costUSD),
            },
          };
        }) ?? null
      );
    }
    case "monthly": {
      const raw = arrayAt("monthly");
      return (
        raw?.map((m) => ({
          label: String(m.month ?? ""),
          // A month is `YYYY-MM`; `-01` makes it sort and read as a date like every other view.
          sortKey: m.month ? `${String(m.month)}-01` : "",
          active: false,
          totals: {
            inputTokens: num(m.inputTokens),
            outputTokens: num(m.outputTokens),
            totalTokens: num(m.totalTokens),
            costUsd: num(m.totalCost),
          },
        })) ?? null
      );
    }
  }
}

/**
 * Reduce one view's `--json` payload to the four numbers the tab renders. Pure.
 *
 * Returns null when the payload does not contain the array this view is supposed to have — which
 * is what a ccusage release that changed its output looks like from here. Null becomes a message
 * naming the version that was run, rather than a grid of zeroes the user would read as "I have
 * spent nothing".
 */
export function reduceUsage(view: UsageStatsView, payload: unknown): UsageStats | null {
  if (!payload || typeof payload !== "object") return null;
  const rows = rowsFor(view, payload as Record<string, unknown>);
  if (rows === null) return null;

  const sorted = [...rows].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  const latest = sorted[0];

  return {
    view,
    entryCount: sorted.length,
    latestLabel: latest?.label ?? "",
    latest: latest ? latest.totals : { ...ZERO },
    total: sum(sorted.map((r) => r.totals)),
    activeBlocks: sorted.filter((r) => r.active).length,
    // Seven days including the newest, which is what "this week" means to someone looking at a
    // usage tab — not the last seven calendar days, which would silently drop days with no usage.
    recent: view === "daily" ? sum(sorted.slice(0, 7).map((r) => r.totals)) : null,
    lastUpdated: latest?.sortKey.slice(0, 10) ?? "",
  };
}

/**
 * `JSON.parse`, tolerating a wrapper line.
 *
 * npx is told to be silent, but a node deprecation warning or a corepack notice still reaches
 * stdout on some setups, and losing a whole view to one stray line would be a bad trade.
 */
function parseJson(stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch {
    const start = stdout.indexOf("{");
    const end = stdout.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(stdout.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/**
 * Run the invocation a token authorises and reduce its output.
 *
 * Takes a token and nothing else — there is no argument by which a caller could make this run
 * something other than what `previewUsageStats` returned and the user was shown. Rejects (with
 * `TokenRefused`) for a forged, replayed, expired or wrong-purpose token; every other failure is a
 * resolved result carrying a message, because "ccusage exited 1" is something the tab reports, not
 * something that should reach the UI as an unhandled rejection.
 */
export async function runUsageStats(token: unknown, view: UsageStatsView): Promise<UsageStatsResult> {
  const inv = claimInvocation(token, "usage-stats");
  const startedAt = Date.now();
  const argv = [inv.bin, ...inv.args];

  const fail = (error: string): UsageStatsResult => ({
    view,
    ok: false,
    stats: null,
    error,
    argv,
    durationMs: Date.now() - startedAt,
  });

  const output = await new Promise<{ stdout: string; error: string | null }>((resolve) => {
    execFile(
      inv.bin,
      inv.args,
      {
        cwd: inv.cwd,
        // npx shells out to node, and a GUI-launched app's PATH may not contain it — the same
        // reason `claude-run.ts` hands its child the expanded list.
        env: { ...process.env, PATH: claudeChildPath() },
        timeout: RUN_TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
      },
      (err, stdout, stderr) => {
        if (!err) return resolve({ stdout, error: null });
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          return resolve({ stdout, error: `Could not run ${inv.bin} — it was there when this was previewed.` });
        }
        const detail = (stderr || err.message).trim().split("\n").slice(-3).join(" ").slice(0, 400);
        resolve({ stdout, error: detail || "ccusage exited without saying why." });
      }
    );
  });

  if (output.error) return fail(output.error);

  const stats = reduceUsage(view, parseJson(output.stdout));
  if (!stats) {
    return fail(
      `ccusage ran, but its \`${view} --json\` output was not in the shape this app reads. ` +
        `Expected the ${view} array from ccusage ${PINNED_CCUSAGE_VERSION}.`
    );
  }

  return { view, ok: true, stats, error: null, argv, durationMs: Date.now() - startedAt };
}
