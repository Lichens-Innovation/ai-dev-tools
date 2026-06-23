import fs from "fs";
import path from "path";
import { mountedProjectPath } from "./maestro-fs";
import { buildDesc, clip, titleFromName } from "./text";

// Deterministic "pre-scaffold" the app performs the moment a create-* form is submitted, so the
// user sees the artifact appear immediately and the /ai-tools dispatcher only has to finish the
// intelligent part (authoring a skill/agent body, enriching a README). It is the create-flow
// counterpart to submitMaestroConfig writing maestro.json directly.
//
// Path reach: writes go through mountedProjectPath, which maps host paths under the repo root to
// the container's /app mount. Targets outside the repo (common for a brand-new marketplace dir)
// are not reachable from inside Docker — those degrade to { scaffolded: false } and the dispatcher
// creates the files host-side instead. Never a hard failure.

export interface ScaffoldResult {
  // Did the app write the artifact(s)?
  scaffolded: boolean;
  // Host path of the primary artifact, for reporting + so the dispatcher knows where to finish.
  path: string;
  // What the dispatcher/Claude still has to do (the LLM part). "" when nothing remains.
  remaining: string;
  // When scaffolded is false, why (so the dispatcher knows to create from scratch host-side).
  reason?: string;
}

function quoteYaml(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Write a file the app can reach (mapping host→container path), without clobbering an existing one.
function tryWriteFile(hostFile: string, contents: string): { ok: boolean; reason?: string } {
  try {
    const target = mountedProjectPath(hostFile);
    if (fs.existsSync(target)) return { ok: false, reason: "file already exists — left untouched" };
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
    return { ok: true };
  } catch {
    return { ok: false, reason: "target not writable from the app (outside the mounted repo under Docker)" };
  }
}

const AUTO_BODY_PLACEHOLDER =
  "<!-- The /ai-tools dispatcher (or /create-skill) authors the full body here from the idea. -->\n" +
  "Describe the workflow, concrete steps, and any reference tables.";

function manualSkillBody(): string {
  return [
    "Add instructions here. Structure freely: step-by-step workflow, reference tables, decision trees — whatever fits the skill.",
    "",
    "Optional subdirectories (create only if needed):",
    "",
    "- `scripts/` — executable helpers (Node.js, Python, shell)",
    "- `references/` — supporting docs or templates",
    "- `assets/` — static files (images, data)",
  ].join("\n");
}

function manualAgentBody(name: string, triggers: string[]): string {
  const when = triggers.length ? triggers.join(", ") : "<describe when this agent applies>";
  return [
    `Instructions for AI coding agents acting as ${name}. See [agents.md](https://agents.md/) for the format.`,
    "",
    "## Role — workflow",
    "",
    "### When to apply",
    "",
    when,
    "",
    "### Workflow",
    "",
    "1. Step one",
    "2. Step two",
    "",
    "### Output",
    "",
    "Describe the expected output format here.",
  ].join("\n");
}

export function scaffoldSkill(p: {
  target: "marketplace" | "project";
  name: string;
  mode: "auto" | "manual";
  idea: string; // idea (auto) or description (manual)
  triggers: string[];
  projectPath?: string;
  marketplacePath?: string;
  plugin?: string;
}): ScaffoldResult {
  const desc = clip(buildDesc(p.mode, p.idea, p.triggers), 140);
  const title = titleFromName(p.name);
  const dirHost =
    p.target === "project"
      ? path.join(p.projectPath ?? "", ".claude", "skills", p.name)
      : path.join(p.marketplacePath ?? "", "plugins", p.plugin ?? "", "skills", p.name);
  const fileHost = path.join(dirHost, "SKILL.md");

  const body = p.mode === "manual" ? manualSkillBody() : AUTO_BODY_PLACEHOLDER;
  const contents = `---\nname: ${p.name}\ndescription: "${quoteYaml(desc)}"\n---\n\n# ${title}\n\n${body}\n`;

  const res = tryWriteFile(fileHost, contents);
  return {
    scaffolded: res.ok,
    path: fileHost,
    remaining:
      p.mode === "auto"
        ? "Author the SKILL.md body from the idea, replacing the placeholder."
        : "Skeleton is complete; refine the instructions if needed.",
    reason: res.reason,
  };
}

export function scaffoldSubagent(p: {
  target: "marketplace" | "project";
  name: string;
  mode: "auto" | "manual";
  idea: string;
  triggers: string[];
  tools: string[];
  projectPath?: string;
  marketplacePath?: string;
  plugin?: string;
}): ScaffoldResult {
  const desc = clip(buildDesc(p.mode, p.idea, p.triggers), 140);
  const title = titleFromName(p.name);
  // Project target is a single file <cwd>/.claude/agents/<name>.md; marketplace is a dir/AGENTS.md.
  const fileHost =
    p.target === "project"
      ? path.join(p.projectPath ?? "", ".claude", "agents", `${p.name}.md`)
      : path.join(p.marketplacePath ?? "", "plugins", p.plugin ?? "", "agents", p.name, "AGENTS.md");

  const toolsLine = p.tools.length ? `\ntools: ${p.tools.join(", ")}` : "";
  const body = p.mode === "manual" ? manualAgentBody(p.name, p.triggers) : AUTO_BODY_PLACEHOLDER;
  const contents = `---\nname: ${p.name}\ndescription: "${quoteYaml(desc)}"${toolsLine}\n---\n\n# ${title}\n\n${body}\n`;

  const res = tryWriteFile(fileHost, contents);
  return {
    scaffolded: res.ok,
    path: fileHost,
    remaining:
      p.mode === "auto"
        ? "Author the AGENTS.md body (role, when-to-apply, workflow, output) from the idea."
        : "Skeleton is complete; fill in the workflow steps.",
    reason: res.reason,
  };
}

// Append a plugin entry to a marketplace.json plugins[] (idempotent), preserving formatting.
function registerPlugin(marketplacePath: string, name: string, description: string): boolean {
  try {
    const mfHost = path.join(marketplacePath, ".claude-plugin", "marketplace.json");
    const mf = mountedProjectPath(mfHost);
    if (!fs.existsSync(mf)) return false;
    const json = JSON.parse(fs.readFileSync(mf, "utf8")) as {
      plugins?: Array<{ name: string; source: string; description?: string }>;
    };
    json.plugins = json.plugins ?? [];
    if (json.plugins.some((pl) => pl.name === name)) return true; // already registered
    json.plugins.push({ name, source: `./plugins/${name}`, description });
    fs.writeFileSync(mf, JSON.stringify(json, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

export function scaffoldPlugin(p: {
  name: string;
  description: string;
  keywords: string[];
  marketplacePath: string;
}): ScaffoldResult {
  const pluginDirHost = path.join(p.marketplacePath, "plugins", p.name);
  const manifestHost = path.join(pluginDirHost, ".claude-plugin", "plugin.json");

  // Inherit author from the marketplace manifest when available (deterministic, no form field).
  let author: { name: string; email: string } | undefined;
  try {
    const mf = mountedProjectPath(path.join(p.marketplacePath, ".claude-plugin", "marketplace.json"));
    const owner = (JSON.parse(fs.readFileSync(mf, "utf8")) as { owner?: { name: string; email: string } }).owner;
    if (owner?.name) author = { name: owner.name, email: owner.email };
  } catch {
    // no marketplace owner available — omit author
  }

  const manifest = {
    name: p.name,
    version: "0.1.0",
    description: p.description,
    ...(author ? { author } : {}),
    keywords: p.keywords,
  };

  const res = tryWriteFile(manifestHost, JSON.stringify(manifest, null, 2) + "\n");
  // Best-effort: create the skills/ folder and register in the marketplace.
  if (res.ok) {
    try {
      fs.mkdirSync(mountedProjectPath(path.join(pluginDirHost, "skills")), { recursive: true });
    } catch {
      /* non-fatal */
    }
  }
  const registered = res.ok ? registerPlugin(p.marketplacePath, p.name, p.description) : false;

  return {
    scaffolded: res.ok,
    path: pluginDirHost,
    remaining: registered
      ? "Plugin manifest written and registered. Add skills/agents with /create-skill or /create-subagent."
      : "Plugin manifest written; register it in the marketplace's marketplace.json plugins[].",
    reason: res.reason,
  };
}

export function scaffoldMarketplace(p: {
  name: string;
  description: string;
  ownerName: string;
  ownerEmail: string;
  homepage?: string;
  targetDir: string;
}): ScaffoldResult {
  const manifestHost = path.join(p.targetDir, ".claude-plugin", "marketplace.json");
  const manifest = {
    name: p.name,
    owner: { name: p.ownerName, email: p.ownerEmail },
    metadata: {
      description: p.description,
      version: "0.1.0",
      ...(p.homepage ? { homepage: p.homepage } : {}),
    },
    plugins: [] as unknown[],
  };

  const res = tryWriteFile(manifestHost, JSON.stringify(manifest, null, 2) + "\n");
  if (res.ok) {
    tryWriteFile(path.join(p.targetDir, "README.md"), `# ${p.name}\n\n${p.description}\n`);
  }

  return {
    scaffolded: res.ok,
    path: p.targetDir,
    remaining:
      "Enrich README.md and add a CLAUDE.md context file; set up git / private-repo and auto-update per /create-marketplace.",
    reason: res.reason,
  };
}
