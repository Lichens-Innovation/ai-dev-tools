// Usage stats — the decision that had to be made before this feature could move out of Docker.
//
// help-server ran `npx --yes ccusage@latest <view> --json` on every view of its Stats tab: a
// package downloaded from the network and executed on the machine, unannounced, on whatever
// version had been published that day. Three properties replace that, and all three are the kind
// that regress silently — a `@latest` restored "to pick up a fix", a local-first lookup that
// stopped looking, a run that no longer needs a token. So they are asserted here.
//
// The runs execute a FAKE `ccusage`: a shell script in a temp directory the resolver is pointed
// at. Against the real one these tests would be slow, non-deterministic, and would go to npm.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  previewUsageStats,
  runUsageStats,
  resolveCcusage,
  ccusageArgv,
  ccusageNotFoundMessage,
  reduceUsage,
  PINNED_CCUSAGE_VERSION,
} from "../../src/core/ccusage.js";
import { previewClaudeRun } from "../../src/core/claude-preview.js";
import { runPreviewedClaude, TokenRefused } from "../../src/core/claude-run.js";
import { clearInvocations, TOKEN_TTL_MS } from "../../src/core/claude-tokens.js";

let tmp: string;

/** A directory holding an executable named `name` that runs `body`. */
function fakeBin(name: string, body: string): { dir: string; bin: string } {
  const dir = fs.mkdtempSync(path.join(tmp, `bin-${name}-`));
  const bin = path.join(dir, name);
  fs.writeFileSync(bin, `#!/bin/sh\n${body}\n`);
  fs.chmodSync(bin, 0o755);
  return { dir, bin };
}

/** A home directory with nothing installed, so fallbacks can't find the developer's own tools. */
const emptyHome = () => fs.mkdtempSync(path.join(tmp, "home-"));

/** Resolver options that see exactly these directories and no real machine. */
const only = (dirs: string[], home: string) => ({
  env: { PATH: dirs.join(":") },
  home,
  platform: "linux" as const,
});

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ccusage-"));
  clearInvocations();
});

afterEach(() => {
  clearInvocations();
  vi.useRealTimers();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("the version pin", () => {
  it("is a concrete version, never a floating tag", () => {
    // `@latest` means the app's behaviour changes without the app changing: a release published
    // this afternoon runs on the user's machine tonight, with output `reduceUsage` has never seen.
    expect(PINNED_CCUSAGE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(PINNED_CCUSAGE_VERSION).not.toMatch(/latest|next|\^|~|\*/);
  });

  it("is what a network fetch would install, and is stated in the preview", () => {
    const { dir } = fakeBin("npx", "true");
    const preview = previewUsageStats("", "daily", only([dir], emptyHome()));

    expect(preview.source).toBe("npx");
    expect(preview.network).toBe(true);
    expect(preview.pinnedVersion).toBe(PINNED_CCUSAGE_VERSION);
    expect(preview.argv).toContain(`ccusage@${PINNED_CCUSAGE_VERSION}`);
    expect(preview.argv.join(" ")).not.toContain("@latest");
  });
});

describe("resolution", () => {
  it("prefers a ccusage already installed, and then touches no network at all", () => {
    const home = emptyHome();
    const { dir: ccusageDir, bin } = fakeBin("ccusage", "true");
    const { dir: npxDir } = fakeBin("npx", "true");

    const cli = resolveCcusage("", only([ccusageDir, npxDir], home));
    expect(cli.source).toBe("local");
    expect(cli.bin).toBe(bin);
    // No `npx`, no version spec — the installed copy is run as it is.
    expect(ccusageArgv(cli, "session")).toEqual([bin, "session", "--json"]);

    const preview = previewUsageStats("", "session", only([ccusageDir, npxDir], home));
    expect(preview.network).toBe(false);
    expect(preview.bin).toBe(bin);
  });

  it("prefers the open project's own pin over anything on PATH", () => {
    // A repo that has ccusage as a devDependency has already made this decision.
    const home = emptyHome();
    const project = fs.mkdtempSync(path.join(tmp, "project-"));
    const projectBin = path.join(project, "node_modules", ".bin");
    fs.mkdirSync(projectBin, { recursive: true });
    fs.writeFileSync(path.join(projectBin, "ccusage"), "#!/bin/sh\ntrue\n");
    fs.chmodSync(path.join(projectBin, "ccusage"), 0o755);

    const { dir: pathDir } = fakeBin("ccusage", "true");

    const cli = resolveCcusage(project, only([pathDir], home));
    expect(cli.bin).toBe(path.join(projectBin, "ccusage"));
  });

  it("falls back to a pinned npx fetch only when nothing is installed", () => {
    const { dir } = fakeBin("npx", "true");
    const cli = resolveCcusage("", only([dir], emptyHome()));
    expect(cli.source).toBe("npx");
    expect(ccusageArgv(cli, "monthly")).toEqual([
      cli.bin,
      "--silent",
      "--yes",
      `ccusage@${PINNED_CCUSAGE_VERSION}`,
      "monthly",
      "--json",
    ]);
  });

  it("does not treat a non-executable file as an install", () => {
    const home = emptyHome();
    const dir = fs.mkdtempSync(path.join(tmp, "bad-"));
    fs.writeFileSync(path.join(dir, "ccusage"), "#!/bin/sh\ntrue\n"); // no +x
    expect(resolveCcusage("", only([dir], home)).source).toBe("none");
  });
});

describe("a machine with neither ccusage nor npx", () => {
  it("degrades in the preview, with nothing to run and nothing authorised", () => {
    // The acceptance criterion: a clear message BEFORE a spawn, not an ENOENT after one.
    const empty = fs.mkdtempSync(path.join(tmp, "nothing-"));
    const preview = previewUsageStats("", "daily", only([empty], emptyHome()));

    expect(preview.source).toBe("none");
    expect(preview.token).toBeNull();
    expect(preview.argv).toEqual([]);
    expect(preview.network).toBe(false);
    expect(preview.unavailable).toMatch(/ccusage/);
    expect(preview.unavailable).not.toMatch(/ENOENT|spawn/);
    expect(preview.searched).toContain(empty);
  });

  it("names the tool and how to get it", () => {
    const message = ccusageNotFoundMessage({ source: "none", bin: null, searched: ["/a", "/b", "/c", "/d"] });
    expect(message).toContain("`ccusage`");
    expect(message).toContain("/a, /b, /c");
    expect(message).toMatch(/npm i -g ccusage/);
  });
});

describe("the token contract", () => {
  const previewLocal = (body: string) => {
    const { dir } = fakeBin("ccusage", body);
    return previewUsageStats("", "session", only([dir], emptyHome()));
  };

  it("refuses a forged token", async () => {
    await expect(runUsageStats("not-a-token-anyone-issued", "session")).rejects.toThrow(TokenRefused);
  });

  it("refuses a run that carries no token at all", async () => {
    for (const bad of [undefined, null, "", 42, { token: "x" }]) {
      await expect(runUsageStats(bad, "session")).rejects.toThrow(TokenRefused);
    }
  });

  it("refuses a replayed token — a preview authorises exactly one run", async () => {
    const preview = previewLocal("echo '{\"sessions\":[]}'");
    await expect(runUsageStats(preview.token, "session")).resolves.toMatchObject({ ok: true });
    await expect(runUsageStats(preview.token, "session")).rejects.toThrow(TokenRefused);
  });

  it("refuses an expired token", async () => {
    const preview = previewLocal("echo '{\"sessions\":[]}'");
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + TOKEN_TTL_MS + 1000);
    await expect(runUsageStats(preview.token, "session")).rejects.toThrow(/expired/i);
  });

  it("will not spend a Claude token, and its own token will not run Claude", async () => {
    // Both channels share one token store, so without the `purpose` check a stats preview would
    // hand the renderer something `claude:run` would claim — and `runPreviewedClaude` would spawn
    // `npx` while every message on screen said Claude.
    const home = emptyHome();
    const project = fs.mkdtempSync(path.join(tmp, "project-"));
    const tasksDir = path.join(project, ".claude", "maestro-tasks");
    fs.mkdirSync(tasksDir, { recursive: true });
    fs.writeFileSync(path.join(tasksDir, "001-a.md"), "# A\n");

    const { dir: claudeDir } = fakeBin("claude", "true");
    const { dir: ccusageDir } = fakeBin("ccusage", "true");

    const claudePreview = await previewClaudeRun(
      project,
      { kind: "maestro-task", filename: "001-a.md" },
      only([claudeDir], home)
    );
    const statsPreview = previewUsageStats("", "session", only([ccusageDir], home));

    await expect(runUsageStats(claudePreview.token, "session")).rejects.toThrow(/authorises a claude run/i);
    await expect(runPreviewedClaude(statsPreview.token, { output: () => {} })).rejects.toThrow(
      /authorises a usage-stats run/i
    );
  });

  it("runs exactly the argv the preview returned", async () => {
    const argvFile = path.join(tmp, "argv.txt");
    const { dir } = fakeBin("ccusage", `printf '%s\\n' "$@" > ${argvFile}\necho '{"sessions":[]}'`);
    const preview = previewUsageStats("", "blocks", only([dir], emptyHome()));

    // The view the run is asked to file the result under cannot change what executes: that comes
    // out of the invocation the token names.
    const result = await runUsageStats(preview.token, "blocks");
    expect(result.argv).toEqual(preview.argv);
    expect(fs.readFileSync(argvFile, "utf8").trimEnd().split("\n")).toEqual(preview.argv.slice(1));
  });
});

describe("running", () => {
  const runWith = async (view: "session" | "daily" | "blocks" | "monthly", body: string) => {
    const { dir } = fakeBin("ccusage", body);
    const preview = previewUsageStats("", view, only([dir], emptyHome()));
    return runUsageStats(preview.token, view);
  };

  it("reduces a session payload to the numbers the tab renders", async () => {
    const result = await runWith(
      "session",
      `cat <<'JSON'
{"sessions":[
  {"sessionId":"old","inputTokens":1,"outputTokens":2,"totalTokens":3,"totalCost":0.5,"lastActivity":"2026-08-01T10:00:00Z"},
  {"sessionId":"new","inputTokens":10,"outputTokens":20,"totalTokens":30,"totalCost":1.5,"lastActivity":"2026-08-03T10:00:00Z"}
]}
JSON`
    );

    expect(result.ok).toBe(true);
    expect(result.stats).toMatchObject({
      view: "session",
      entryCount: 2,
      latestLabel: "new",
      latest: { inputTokens: 10, outputTokens: 20, totalTokens: 30, costUsd: 1.5 },
      total: { inputTokens: 11, outputTokens: 22, totalTokens: 33, costUsd: 2 },
      lastUpdated: "2026-08-03",
      recent: null,
    });
  });

  it("adds a seven-row window for the daily view, and only for it", async () => {
    const days = Array.from({ length: 9 }, (_, i) => ({
      date: `2026-08-${String(i + 1).padStart(2, "0")}`,
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      totalCost: 1,
    }));
    const result = await runWith("daily", `cat <<'JSON'\n${JSON.stringify({ daily: days })}\nJSON`);

    expect(result.stats!.entryCount).toBe(9);
    // Newest seven, not the last seven calendar days — a day with no usage has no row, and
    // dropping it would understate the week.
    expect(result.stats!.recent).toEqual({ inputTokens: 7, outputTokens: 7, totalTokens: 14, costUsd: 7 });
    expect(result.stats!.total.costUsd).toBe(9);
  });

  it("counts the blocks that are still open", async () => {
    const result = await runWith(
      "blocks",
      `cat <<'JSON'
{"blocks":[
  {"startTime":"2026-08-03T00:00:00Z","isActive":true,"tokenCounts":{"inputTokens":5,"outputTokens":6},"totalTokens":11,"costUSD":2},
  {"startTime":"2026-08-02T00:00:00Z","isActive":false,"tokenCounts":{"inputTokens":1,"outputTokens":1},"totalTokens":2,"costUSD":1}
]}
JSON`
    );
    expect(result.stats).toMatchObject({ entryCount: 2, activeBlocks: 1 });
    expect(result.stats!.latest).toEqual({ inputTokens: 5, outputTokens: 6, totalTokens: 11, costUsd: 2 });
  });

  it("reports a non-zero exit as a message, not as a rejection", async () => {
    const result = await runWith("session", 'echo "ccusage: no data found" >&2\nexit 1');
    expect(result.ok).toBe(false);
    expect(result.stats).toBeNull();
    expect(result.error).toContain("no data found");
  });

  it("says so when ccusage answers in a shape this app does not read", async () => {
    // What a release that renamed its output array looks like from here. A grid of zeroes would
    // read as "I have spent nothing", which is a worse lie than an error.
    const result = await runWith("session", `echo '{"usageBySession":[]}'`);
    expect(result.ok).toBe(false);
    expect(result.error).toContain(PINNED_CCUSAGE_VERSION);
  });

  it("survives a stray line before the JSON", async () => {
    const result = await runWith("monthly", `echo "(node:1) DeprecationWarning: something"\necho '{"monthly":[]}'`);
    expect(result.ok).toBe(true);
    expect(result.stats).toMatchObject({ entryCount: 0, lastUpdated: "", latestLabel: "" });
  });
});

describe("reduceUsage", () => {
  it("returns null rather than zeroes for a payload that is not this view's", () => {
    expect(reduceUsage("daily", { sessions: [] })).toBeNull();
    expect(reduceUsage("session", null)).toBeNull();
    expect(reduceUsage("blocks", "nope")).toBeNull();
  });

  it("dates a month so it sorts and reads like every other view", () => {
    const stats = reduceUsage("monthly", {
      monthly: [
        { month: "2026-07", inputTokens: 1, outputTokens: 1, totalTokens: 2, totalCost: 1 },
        { month: "2026-08", inputTokens: 3, outputTokens: 3, totalTokens: 6, totalCost: 2 },
      ],
    });
    expect(stats).toMatchObject({ latestLabel: "2026-08", lastUpdated: "2026-08-01" });
  });
});
