// Where the bundled subagents come from.
//
// This resolution is the kind that only breaks in a launched app: `import.meta.dirname` points at
// packages/maestro-core/src under vitest but at apps/maestro/out/main once electron-vite has
// bundled the main process — which it does for `dev` as well as `build`. A fixed number of `../`
// hops is right in exactly one of those and silently returns null in the other, which shows up as
// an agent picker that has quietly lost the Maestro subagents. Hence a test that asserts the real
// monorepo resolves, and one that asserts it still resolves from the built bundle's depth.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defaultBundledAgentsDir, discoverAgents, findUpBundledAgents } from "../src/discovery.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const realAgentsDir = path.join(repoRoot, "plugins", "ai-tools-manager", "agents");

describe("defaultBundledAgentsDir", () => {
  const savedEnv = process.env.MAESTRO_BUNDLED_AGENTS_DIR;

  afterEach(() => {
    if (savedEnv === undefined) delete process.env.MAESTRO_BUNDLED_AGENTS_DIR;
    else process.env.MAESTRO_BUNDLED_AGENTS_DIR = savedEnv;
  });

  it("finds the plugin's agents directory in this repo", () => {
    delete process.env.MAESTRO_BUNDLED_AGENTS_DIR;
    expect(defaultBundledAgentsDir()).toBe(realAgentsDir);
  });

  it("prefers MAESTRO_BUNDLED_AGENTS_DIR when it exists", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-agents-"));
    try {
      process.env.MAESTRO_BUNDLED_AGENTS_DIR = tmp;
      expect(defaultBundledAgentsDir()).toBe(tmp);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("ignores MAESTRO_BUNDLED_AGENTS_DIR pointing at nothing", () => {
    process.env.MAESTRO_BUNDLED_AGENTS_DIR = path.join(os.tmpdir(), "maestro-does-not-exist");
    expect(defaultBundledAgentsDir()).toBe(realAgentsDir);
  });

  it("resolves from the depth electron-vite bundles the main process to", () => {
    // apps/maestro/out/main/index.js — two levels deeper than packages/maestro-core/src, which is
    // why the original fixed `../../../` landed on apps/plugins/… and returned null.
    expect(findUpBundledAgents(path.join(repoRoot, "apps", "maestro", "out", "main"))).toBe(
      realAgentsDir,
    );
  });

  it("resolves from the source depth too", () => {
    expect(findUpBundledAgents(path.join(repoRoot, "packages", "maestro-core", "src"))).toBe(
      realAgentsDir,
    );
  });

  it("returns null outside any tree containing the plugin", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-nowhere-"));
    try {
      expect(findUpBundledAgents(tmp)).toBeNull();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("discoverAgents", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maestro-discover-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("tags the plugin's bundled agents and actually returns some", async () => {
    const agents = await discoverAgents(tmp, defaultBundledAgentsDir());
    const bundled = agents.filter((a) => a.source === "ai-tools-manager");
    expect(bundled.length).toBeGreaterThan(0);
  });
});
