// The deterministic half of the create-* flows.
//
// Two properties are worth more than the rest of this file put together:
//
//   1. NO MODEL IS INVOLVED. `scaffoldCreate` is a pure function of the form plus the filesystem,
//      so every artifact below is asserted byte for byte. If a create flow ever grew a call out to
//      one, these assertions would be the first thing to go non-deterministic.
//   2. A FAILURE LEAVES NOTHING BEHIND. The web app's version wrote a plugin manifest, then
//      best-effort created `skills/`, then best-effort registered it, and reported success if the
//      first landed — so a marketplace.json it could not rewrite left an unregistered plugin on
//      disk and a summary saying it was fine. The rollback tests are that bug's regression suite.
//
// Everything runs against a temp `home`, so the marketplaces under test are fixtures rather than
// whatever the developer happens to have registered with Claude Code.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { scaffoldCreate, resolveCreateTarget, validateCreateRequest } from "../../src/core/scaffold.js";
import { listMarketplaces, marketplacePath } from "../../src/core/marketplaces.js";
import type { CreateRequest } from "../../src/core/contracts.js";

let tmp: string;
let home: string;
let project: string;
let market: string;

/** A home with one local marketplace holding one plugin — the shape the forms select from. */
function makeHome(): void {
  home = fs.mkdtempSync(path.join(tmp, "home-"));
  market = fs.mkdtempSync(path.join(tmp, "market-"));

  fs.mkdirSync(path.join(market, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(market, ".claude-plugin", "marketplace.json"),
    JSON.stringify(
      {
        name: "my-tools",
        owner: { name: "Ada", email: "ada@example.com" },
        metadata: { description: "Tools", version: "0.1.0" },
        plugins: [{ name: "toolkit", source: "./plugins/toolkit", description: "A toolkit" }],
      },
      null,
      2
    ) + "\n"
  );
  fs.mkdirSync(path.join(market, "plugins", "toolkit", "skills"), { recursive: true });

  const plugins = path.join(home, ".claude", "plugins");
  fs.mkdirSync(plugins, { recursive: true });
  fs.writeFileSync(
    path.join(plugins, "known_marketplaces.json"),
    JSON.stringify({
      "my-tools": { source: { source: "directory" }, installLocation: market, lastUpdated: "now" },
      // A GitHub-sourced marketplace is a plugin CACHE, not a repo the user can commit to.
      remote: { source: { source: "github", repo: "someone/tools" }, installLocation: "/nope", lastUpdated: "now" },
    })
  );
}

const opts = () => ({ home });

const skill = (over: Partial<Extract<CreateRequest, { kind: "create-skill" }>> = {}) =>
  ({
    kind: "create-skill",
    mode: "auto",
    target: "marketplace",
    name: "migration-reviewer",
    idea: "Reviews database migrations for safety issues. Checks for missing rollbacks.",
    useWhen: ["a .sql file changes", "a migration is added"],
    marketplace: "my-tools",
    plugin: "toolkit",
    ...over,
  }) as Extract<CreateRequest, { kind: "create-skill" }>;

const subagent = (over: Partial<Extract<CreateRequest, { kind: "create-subagent" }>> = {}) =>
  ({
    kind: "create-subagent",
    mode: "auto",
    target: "marketplace",
    name: "security-reviewer",
    idea: "Audits pull requests for security issues. Looks for hardcoded secrets.",
    description: "",
    triggers: ["a PR touches auth"],
    tools: ["Bash", "Read"],
    marketplace: "my-tools",
    plugin: "toolkit",
    ...over,
  }) as Extract<CreateRequest, { kind: "create-subagent" }>;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-scaffold-"));
  project = fs.mkdtempSync(path.join(tmp, "project-"));
  makeHome();
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("reading the user's marketplaces", () => {
  it("lists local ones with their plugins, and excludes GitHub-sourced caches", () => {
    const found = listMarketplaces(opts());
    expect(found.map((m) => m.name)).toEqual(["my-tools"]);
    expect(found[0].path).toBe(market);
    expect(found[0].plugins).toEqual(["toolkit"]);
  });

  it("resolves a name to a path, and refuses one it does not know", () => {
    expect(marketplacePath("my-tools", opts())).toBe(market);
    expect(marketplacePath("remote", opts())).toBeNull();
    expect(marketplacePath("invented", opts())).toBeNull();
  });

  it("reads nothing from the Docker precompute file", () => {
    // The whole point of this module: on the host there is no /tmp/marketplace-data.json, and a
    // home with no known_marketplaces.json yields an empty list rather than an exception.
    const bare = fs.mkdtempSync(path.join(tmp, "bare-home-"));
    expect(listMarketplaces({ home: bare })).toEqual([]);
  });
});

describe("scaffolding a skill", () => {
  it("writes the marketplace file with the description the form previewed", () => {
    const res = scaffoldCreate(project, skill(), opts());

    const file = path.join(market, "plugins", "toolkit", "skills", "migration-reviewer", "SKILL.md");
    expect(res).toMatchObject({ scaffolded: true, path: file, needsModel: true, written: [file] });
    expect(fs.readFileSync(file, "utf8")).toBe(
      `---\n` +
        `name: migration-reviewer\n` +
        `description: "Reviews database migrations for safety issues. Use when a .sql file changes or a migration is added."\n` +
        `---\n\n` +
        `# Migration Reviewer\n\n` +
        `<!-- The /ai-tools dispatcher (or /create-skill) authors the full body here from the idea. -->\n` +
        `Describe the workflow, concrete steps, and any reference tables.\n`
    );
  });

  it("writes into the open project when the target is Project", () => {
    const res = scaffoldCreate(project, skill({ target: "project" }), opts());
    expect(res.path).toBe(path.join(project, ".claude", "skills", "migration-reviewer", "SKILL.md"));
    expect(fs.existsSync(res.path)).toBe(true);
  });

  it("finishes the artifact outright in manual mode, so no model is needed", () => {
    const res = scaffoldCreate(project, skill({ mode: "manual", idea: "Reviews migrations." }), opts());
    expect(res.needsModel).toBe(false);
    const body = fs.readFileSync(res.path, "utf8");
    expect(body).toContain(`description: "Reviews migrations."`);
    expect(body).toContain("Add instructions here.");
    expect(body).not.toContain("<!--");
  });

  it("derives a kebab-case name when the form left it blank", () => {
    const res = scaffoldCreate(project, skill({ name: "" }), opts());
    expect(path.basename(path.dirname(res.path))).toBe("reviews");
  });

  it("escapes quotes so a description cannot break the frontmatter", () => {
    const res = scaffoldCreate(project, skill({ mode: "manual", idea: 'Handles "quoted" input.' }), opts());
    expect(fs.readFileSync(res.path, "utf8")).toContain(`description: "Handles \\"quoted\\" input."`);
  });

  it("clips a long description to 140 characters", () => {
    const long = "A".repeat(300) + ".";
    const res = scaffoldCreate(project, skill({ mode: "manual", idea: long }), opts());
    const line = fs.readFileSync(res.path, "utf8").split("\n")[2];
    expect(line.slice('description: "'.length, -1)).toHaveLength(140);
  });
});

describe("scaffolding a subagent", () => {
  it("writes a marketplace agent as a directory with AGENTS.md, and lists its tools", () => {
    const res = scaffoldCreate(project, subagent(), opts());
    expect(res.path).toBe(path.join(market, "plugins", "toolkit", "agents", "security-reviewer", "AGENTS.md"));
    expect(fs.readFileSync(res.path, "utf8")).toContain("\ntools: Bash, Read\n");
  });

  it("writes a project agent as one flat file, the layout Claude Code reads", () => {
    const res = scaffoldCreate(project, subagent({ target: "project" }), opts());
    expect(res.path).toBe(path.join(project, ".claude", "agents", "security-reviewer.md"));
  });

  it("omits the tools line entirely when none were given", () => {
    const res = scaffoldCreate(project, subagent({ tools: [] }), opts());
    expect(fs.readFileSync(res.path, "utf8")).not.toContain("tools:");
  });

  it("takes the description field, not the idea, in manual mode", () => {
    const res = scaffoldCreate(
      project,
      subagent({ mode: "manual", idea: "IGNORED", description: "Audits dependencies." }),
      opts()
    );
    const body = fs.readFileSync(res.path, "utf8");
    expect(body).toContain(`description: "Audits dependencies."`);
    expect(body).not.toContain("IGNORED");
  });
});

describe("scaffolding a plugin", () => {
  const plugin: CreateRequest = {
    kind: "create-plugin",
    name: "linting",
    description: "Lint helpers",
    keywords: ["lint", "style"],
    marketplace: "my-tools",
  };

  it("writes the manifest, creates skills/, and registers it in the marketplace", () => {
    const res = scaffoldCreate(project, plugin, opts());
    expect(res.scaffolded).toBe(true);
    expect(res.needsModel).toBe(false);

    const manifest = JSON.parse(
      fs.readFileSync(path.join(market, "plugins", "linting", ".claude-plugin", "plugin.json"), "utf8")
    );
    expect(manifest).toEqual({
      name: "linting",
      version: "0.1.0",
      description: "Lint helpers",
      // Inherited from the marketplace owner rather than asked for again.
      author: { name: "Ada", email: "ada@example.com" },
      keywords: ["lint", "style"],
    });
    expect(fs.existsSync(path.join(market, "plugins", "linting", "skills"))).toBe(true);

    const registry = JSON.parse(fs.readFileSync(path.join(market, ".claude-plugin", "marketplace.json"), "utf8"));
    expect(registry.plugins).toContainEqual({
      name: "linting",
      source: "./plugins/linting",
      description: "Lint helpers",
    });
    // The existing entry is untouched — registration appends, it does not rewrite the catalog.
    expect(registry.plugins[0].name).toBe("toolkit");
  });

  it("rolls the whole plugin back when the marketplace manifest cannot be rewritten", () => {
    // The failure the web app reported as success. Registration is the last step, so everything
    // else has already been written when it goes wrong.
    const registryFile = path.join(market, ".claude-plugin", "marketplace.json");
    fs.writeFileSync(registryFile, "{ not json");

    const res = scaffoldCreate(project, plugin, opts());

    expect(res.scaffolded).toBe(false);
    expect(res.reason).toBeTruthy();
    expect(fs.existsSync(path.join(market, "plugins", "linting"))).toBe(false);
    // And the file it failed on is byte-identical to what it found.
    expect(fs.readFileSync(registryFile, "utf8")).toBe("{ not json");
  });
});

describe("scaffolding a marketplace", () => {
  const marketplace = (targetDir: string): CreateRequest => ({
    kind: "create-marketplace",
    name: "my-tools",
    description: "My personal tools",
    ownerName: "Ada",
    ownerEmail: "ada@example.com",
    homepage: "",
    targetDir,
    privateRepo: false,
  });

  it("writes the manifest and a starter README into a directory that does not exist yet", () => {
    const target = path.join(tmp, "brand-new");
    const res = scaffoldCreate(project, marketplace(target), opts());

    expect(res.scaffolded).toBe(true);
    expect(res.path).toBe(target);
    expect(JSON.parse(fs.readFileSync(path.join(target, ".claude-plugin", "marketplace.json"), "utf8"))).toEqual({
      name: "my-tools",
      owner: { name: "Ada", email: "ada@example.com" },
      metadata: { description: "My personal tools", version: "0.1.0" },
      plugins: [],
    });
    expect(fs.readFileSync(path.join(target, "README.md"), "utf8")).toBe("# my-tools\n\nMy personal tools\n");
  });

  it("includes the homepage only when one was given", () => {
    const target = path.join(tmp, "with-home");
    scaffoldCreate(project, { ...marketplace(target), homepage: "https://example.com" } as CreateRequest, opts());
    const manifest = JSON.parse(fs.readFileSync(path.join(target, ".claude-plugin", "marketplace.json"), "utf8"));
    expect(manifest.metadata.homepage).toBe("https://example.com");
  });

  it("reaches a path outside the project, which Docker could not", () => {
    // The mounted-repo limitation is gone: a brand-new marketplace anywhere on the host is
    // writable, so there is no `scaffolded: false` for the dispatcher to pick up host-side.
    const outside = path.join(os.tmpdir(), `maestro-outside-${process.pid}-${Date.now()}`);
    try {
      expect(scaffoldCreate(project, marketplace(outside), opts()).scaffolded).toBe(true);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("refusing to write", () => {
  it("leaves an existing artifact untouched and says so", () => {
    const first = scaffoldCreate(project, skill(), opts());
    fs.writeFileSync(first.path, "hand-edited\n");

    const second = scaffoldCreate(project, skill(), opts());

    expect(second.scaffolded).toBe(false);
    expect(second.reason).toMatch(/already exists/);
    expect(second.written).toEqual([]);
    expect(fs.readFileSync(first.path, "utf8")).toBe("hand-edited\n");
  });

  it("rejects bad input before anything is written", () => {
    const cases: Array<[CreateRequest, RegExp]> = [
      [skill({ name: "Not Kebab" }), /kebab-case/],
      [skill({ idea: "   " }), /Describe what this skill/],
      [skill({ marketplace: "invented" }), /No local marketplace/],
      [skill({ plugin: "no-such-plugin" }), /has no plugin named/],
      [subagent({ mode: "manual", name: "", description: "x" }), /name is required/],
      [
        {
          kind: "create-marketplace",
          name: "my-tools",
          description: "d",
          ownerName: "Ada",
          ownerEmail: "nope",
          homepage: "",
          targetDir: "/tmp/x",
          privateRepo: false,
        },
        /valid owner email/,
      ],
      [
        {
          kind: "create-marketplace",
          name: "my-tools",
          description: "d",
          ownerName: "Ada",
          ownerEmail: "a@b.co",
          homepage: "",
          targetDir: "relative/path",
          privateRepo: false,
        },
        /absolute path/,
      ],
    ];

    for (const [request, message] of cases) {
      const res = scaffoldCreate(project, request, opts());
      expect(res.scaffolded, JSON.stringify(request)).toBe(false);
      expect(res.reason ?? "").toMatch(message);
      expect(res.written).toEqual([]);
    }
  });

  it("refuses a project target with no project open", () => {
    expect(validateCreateRequest("", skill({ target: "project" }), opts())).toContainEqual(
      expect.stringMatching(/No project is open/)
    );
  });

  it("refuses to resolve a path for an invalid request rather than inventing one", () => {
    expect(() => resolveCreateTarget(project, skill({ marketplace: "invented" }), opts())).toThrow(
      /No local marketplace/
    );
  });
});

describe("the path the preview shows and the path the scaffold writes", () => {
  it("are the same, for every kind", () => {
    // The confirmation modal names a file for the user to consent to. It gets that name from
    // `resolveCreateTarget`; so does the writer. Anything that forks those two resolutions makes
    // the modal describe a file other than the one on disk.
    const requests: CreateRequest[] = [
      skill(),
      skill({ target: "project" }),
      subagent(),
      subagent({ target: "project" }),
      { kind: "create-plugin", name: "linting", description: "d", keywords: [], marketplace: "my-tools" },
    ];
    for (const request of requests) {
      const resolved = resolveCreateTarget(project, request, opts());
      const written = scaffoldCreate(project, request, opts());
      expect(written.scaffolded, JSON.stringify(request)).toBe(true);
      expect(written.path).toBe(resolved.path);
    }
  });
});
