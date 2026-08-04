// The create-* flows crossing the bridge.
//
// The acceptance criterion these exist for is "every CLI invocation from these routes goes through
// the preview → confirm → run path; none spawns a process directly". The structural half of that
// is already pinned in `claude.test.ts` (preview's import graph cannot reach `child_process`); what
// is left is the part specific to these four kinds:
//
//   • the prompt names the file the SCAFFOLD ALREADY WROTE, so a run finishes an artifact rather
//     than creating one — and it names it via the same resolution the writer used;
//   • it is prose, not `/create-skill`. The slash command would fire the plugin's
//     UserPromptExpansion hook, which launches the Docker app and blocks on a form submission a
//     headless run cannot make. A test is the only thing that would notice that regression, since
//     the prompt would still look perfectly reasonable in the modal;
//   • the working directory follows the artifact. A skill written into a marketplace repo lives
//     outside the open project, and a run whose edits are all outside its cwd gets none of them
//     auto-accepted.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { previewClaudeRun, CLAUDE_BASE_FLAGS } from "../../src/core/claude-preview.js";
import { scaffoldCreate } from "../../src/core/scaffold.js";
import { clearInvocations } from "../../src/core/claude-tokens.js";
import type { CreateRequest } from "../../src/core/contracts.js";

let tmp: string;
let home: string;
let project: string;
let market: string;
let binDir: string;

/** Resolver options that see one fake CLI and one fixture home, and no real machine. */
const opts = () => ({ env: { PATH: binDir }, home, platform: "linux" as const });

const skill: CreateRequest = {
  kind: "create-skill",
  mode: "auto",
  target: "marketplace",
  name: "migration-reviewer",
  idea: "Reviews database migrations for safety issues.",
  useWhen: ["a .sql file changes", "a migration is added"],
  marketplace: "my-tools",
  plugin: "toolkit",
};

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "create-preview-"));
  project = fs.mkdtempSync(path.join(tmp, "project-"));
  home = fs.mkdtempSync(path.join(tmp, "home-"));
  market = fs.mkdtempSync(path.join(tmp, "market-"));

  fs.mkdirSync(path.join(market, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(market, ".claude-plugin", "marketplace.json"),
    JSON.stringify({ name: "my-tools", owner: { name: "Ada", email: "ada@example.com" }, plugins: [{ name: "toolkit" }] }, null, 2) + "\n",
  );
  fs.mkdirSync(path.join(market, "plugins", "toolkit", "skills"), { recursive: true });

  const plugins = path.join(home, ".claude", "plugins");
  fs.mkdirSync(plugins, { recursive: true });
  fs.writeFileSync(
    path.join(plugins, "known_marketplaces.json"),
    JSON.stringify({ "my-tools": { source: { source: "directory" }, installLocation: market, lastUpdated: "now" } }),
  );

  binDir = fs.mkdtempSync(path.join(tmp, "bin-"));
  fs.writeFileSync(path.join(binDir, "claude"), "#!/bin/sh\ntrue\n");
  fs.chmodSync(path.join(binDir, "claude"), 0o755);

  clearInvocations();
});

afterEach(() => {
  clearInvocations();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("the finishing prompt", () => {
  it("names the exact file the scaffold wrote", () => {
    const written = scaffoldCreate(project, skill, { home });
    const preview = previewClaudeRun(project, skill, opts());

    expect(written.scaffolded).toBe(true);
    expect(preview.prompt).toContain(written.path);
    expect(preview.targets.map((t) => t.path)).toEqual([written.path]);
    expect(preview.targets[0].action).toBe("modify");
  });

  it("tells the run to finish the artifact rather than recreate it or touch its frontmatter", () => {
    const preview = previewClaudeRun(project, skill, opts());
    expect(preview.prompt).toMatch(/already written/);
    expect(preview.prompt).toMatch(/Do not recreate it/);
    expect(preview.prompt).toMatch(/do not change its frontmatter/);
  });

  it("carries the form's own words, so the run is about the artifact the user described", () => {
    const preview = previewClaudeRun(project, skill, opts());
    expect(preview.prompt).toContain("Reviews database migrations for safety issues.");
    expect(preview.prompt).toContain("a .sql file changes or a migration is added");
  });

  it("is prose, never a slash command that would re-enter the form flow", () => {
    // `/create-skill` in a headless run fires the plugin's UserPromptExpansion hook, which brings
    // the Docker app up and waits for a submission that can never arrive.
    for (const request of allFour()) {
      const preview = previewClaudeRun(project, request, opts());
      expect(preview.prompt, request.kind).not.toMatch(/(^|\s)\/create-(skill|subagent|plugin|marketplace)/);
      expect(preview.prompt, request.kind).not.toMatch(/(^|\s)\/ai-tools/);
    }
  });

  it("covers all four kinds", () => {
    for (const request of allFour()) {
      const preview = previewClaudeRun(project, request, opts());
      expect(preview.prompt.length, request.kind).toBeGreaterThan(80);
      expect(preview.targets.length, request.kind).toBeGreaterThan(0);
      // Exactly what the modal shows and exactly what runs — prompt included, verbatim.
      expect(preview.argv).toEqual([path.join(binDir, "claude"), ...CLAUDE_BASE_FLAGS, preview.prompt]);
    }
  });
});

describe("where the run happens", () => {
  it("is the project, for an artifact written into the project", () => {
    const preview = previewClaudeRun(project, { ...skill, target: "project" }, opts());
    expect(preview.cwd).toBe(project);
  });

  it("is the marketplace repo, for an artifact written into one", () => {
    // Not the open project: every edit would then be outside the CLI's working directory, where
    // `--permission-mode acceptEdits` does not apply and a headless run has nobody to ask.
    expect(previewClaudeRun(project, skill, opts()).cwd).toBe(market);
  });

  it("is the new marketplace's own directory, for create-marketplace", () => {
    const targetDir = path.join(tmp, "brand-new");
    const preview = previewClaudeRun(project, marketplaceRequest(targetDir), opts());
    expect(preview.cwd).toBe(targetDir);
    expect(preview.prompt).toContain("CLAUDE.md");
  });

  it("mentions private-repo token setup only when the form asked for it", () => {
    const targetDir = path.join(tmp, "private-one");
    const plain = previewClaudeRun(project, marketplaceRequest(targetDir), opts());
    const priv = previewClaudeRun(project, { ...marketplaceRequest(targetDir), privateRepo: true }, opts());
    expect(plain.prompt).not.toMatch(/GITHUB_TOKEN/);
    expect(priv.prompt).toMatch(/GITHUB_TOKEN/);
  });
});

describe("a request the app will not run", () => {
  it("is refused at preview, so no token is ever issued for it", () => {
    expect(() => previewClaudeRun(project, { ...skill, marketplace: "invented" }, opts())).toThrow(
      /No local marketplace/,
    );
    expect(() => previewClaudeRun(project, { ...skill, name: "Not Kebab" }, opts())).toThrow(/kebab-case/);
  });
});

describe("with no CLI installed", () => {
  it("still hands back the whole prompt, and nothing runnable", () => {
    const nothing = fs.mkdtempSync(path.join(tmp, "empty-bin-"));
    const preview = previewClaudeRun(project, skill, { env: { PATH: nothing }, home, platform: "linux" });

    expect(preview.available).toBe(false);
    expect(preview.token).toBeNull();
    // Copy prompt is the fallback that keeps these routes useful without the CLI — the scaffold
    // has already run, so pasting this into a session finishes the same artifact.
    expect(preview.prompt).toContain("Reviews database migrations for safety issues.");
  });
});

function marketplaceRequest(targetDir: string): CreateRequest {
  return {
    kind: "create-marketplace",
    name: "my-new-tools",
    description: "My personal tools",
    ownerName: "Ada",
    ownerEmail: "ada@example.com",
    homepage: "",
    targetDir,
    privateRepo: false,
  };
}

function allFour(): CreateRequest[] {
  return [
    skill,
    {
      kind: "create-subagent",
      mode: "auto",
      target: "marketplace",
      name: "security-reviewer",
      idea: "Audits pull requests for security issues.",
      description: "",
      triggers: ["a PR touches auth"],
      tools: ["Bash", "Read"],
      marketplace: "my-tools",
      plugin: "toolkit",
    },
    { kind: "create-plugin", name: "linting", description: "Lint helpers", keywords: ["lint"], marketplace: "my-tools" },
    marketplaceRequest(path.join(tmp, "brand-new")),
  ];
}
