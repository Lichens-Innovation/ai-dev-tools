// The deterministic half of the four create-* flows: everything that can be written without a
// model, written the moment the form is submitted.
//
// PORTED FROM `apps/ai-tools-manager/src/utils/scaffold.ts`, with three things gone and one added.
//
// Gone: `mountedProjectPath`. There is no container mount, so the branch where a target sits
// outside the mounted repo and degrades to `scaffolded: false` for the dispatcher to finish
// host-side has nothing left to describe — every path on the host is reachable. `scaffolded: false`
// now means a real failure with a real reason, which is why the callers can surface it as one.
//
// Gone: `create-result.ts`. Its whole job was the `/tmp/result.json` envelope (`aiToolsAction` +
// `hookSpecificOutput`) that a hook read to unblock a waiting Claude session. There is no hook and
// no result file; these functions return their summary to the caller directly.
//
// Gone: destination paths crossing a process boundary. The web app's submit handlers took a `cwd`
// and a `marketplacePath` from the form payload. Here `resolveCreateTarget` derives every path from
// the open project root plus a marketplace NAME the user picked out of a list this process
// produced — so a renderer describes an artifact and never nominates a directory.
//
// Added: the writes are all-or-nothing. The old version wrote the manifest, then best-effort
// mkdir'd `skills/`, then best-effort registered the plugin, and reported `scaffolded: true` if the
// first one landed — so a failure halfway left a plugin on disk that no marketplace knew about and
// a summary that said it was fine. Every flow here builds its complete list of steps first and
// rolls back what it did if any of them fails, because "a failed write surfaces the reason rather
// than leaving a partial artifact" is only true if something undoes the partial artifact.

import fs from "node:fs";
import path from "node:path";
import { listMarketplaces, marketplaceOwner, marketplacePath, type MarketplaceOptions } from "./marketplaces.js";
import { buildDesc, clip, deriveName, titleFromName } from "./text.js";
import type { CreateRequest, ScaffoldResult } from "./contracts.js";

export type { CreateRequest, ScaffoldResult };

// ── where an artifact goes ───────────────────────────────────────────────────────────────────

/** The one resolution of "where does this land", shared by the scaffold and the bridge's preview. */
export interface CreateTarget {
  /** The kebab-case name actually used — derived from the idea when the form left it blank. */
  name: string;
  /** Absolute path of the primary artifact: the file for a skill/agent, the directory otherwise. */
  path: string;
  /** The marketplace repo this writes into, or "" for a project-local artifact. */
  marketplacePath: string;
}

const KEBAB = /^[a-z][a-z0-9-]*$/;

/**
 * Why a request cannot be scaffolded, in the user's terms — empty when it can.
 *
 * The renderer validates the same rules with zod so the user sees them per-field as they type.
 * This is the copy that decides, because main does not get to assume the renderer ran: a request
 * that reaches here invalid is refused before anything touches the disk.
 */
export function validateCreateRequest(
  projectRoot: string,
  request: CreateRequest,
  opts: MarketplaceOptions = {}
): string[] {
  const errors: string[] = [];
  const named = (name: string, required: boolean) => {
    if (!name) {
      if (required) errors.push("A name is required.");
      return;
    }
    if (!KEBAB.test(name)) errors.push(`"${name}" is not kebab-case: use lowercase letters, numbers and dashes.`);
  };

  const intoMarketplace = (marketplace: string, plugin: string) => {
    const found = marketplacePath(marketplace, opts);
    if (!marketplace) errors.push("Pick a marketplace, or switch the target to Project.");
    else if (!found) errors.push(`No local marketplace named "${marketplace}" is registered with Claude Code.`);
    if (!plugin) errors.push("Pick a plugin to file this under.");
    else if (
      found &&
      !listMarketplaces(opts)
        .find((m) => m.name === marketplace)
        ?.plugins.includes(plugin)
    ) {
      errors.push(`"${marketplace}" has no plugin named "${plugin}".`);
    }
  };

  const intoProject = () => {
    if (!projectRoot) errors.push("No project is open — open one, or write into a marketplace instead.");
  };

  switch (request.kind) {
    case "create-skill": {
      named(request.name.trim(), request.mode === "manual");
      if (!request.idea.trim()) errors.push("Describe what this skill should do.");
      if (request.target === "marketplace") intoMarketplace(request.marketplace, request.plugin);
      else intoProject();
      break;
    }
    case "create-subagent": {
      named(request.name.trim(), request.mode === "manual");
      const body = request.mode === "auto" ? request.idea : request.description;
      if (!body.trim()) errors.push("Describe what this subagent should do.");
      if (request.target === "marketplace") intoMarketplace(request.marketplace, request.plugin);
      else intoProject();
      break;
    }
    case "create-plugin": {
      named(request.name.trim(), true);
      if (!request.description.trim()) errors.push("Describe what this plugin provides.");
      if (!request.marketplace) errors.push("Pick a marketplace to add the plugin to.");
      else if (!marketplacePath(request.marketplace, opts)) {
        errors.push(`No local marketplace named "${request.marketplace}" is registered with Claude Code.`);
      }
      break;
    }
    case "create-marketplace": {
      named(request.name.trim(), true);
      if (!request.description.trim()) errors.push("Describe what this marketplace provides.");
      if (!request.ownerName.trim()) errors.push("An owner name is required.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.ownerEmail.trim())) errors.push("Enter a valid owner email.");
      // Absolute only: a relative path would resolve against whatever directory the app happens to
      // have been launched from, which is not a place a user ever meant to create a marketplace.
      if (!request.targetDir.trim()) errors.push("Choose where to create the marketplace.");
      else if (!path.isAbsolute(request.targetDir.trim()))
        errors.push("The target directory must be an absolute path.");
      break;
    }
    default:
      errors.push(`Unsupported create request: ${JSON.stringify(request)}`);
  }
  return errors;
}

/**
 * Where this request's artifact goes, and under what name.
 *
 * Called by the scaffold to write and by `claude-preview.ts` to tell the user which file the run
 * will finish. One resolution, so the confirmation cannot name a different file than the one on
 * disk. Throws on an invalid request rather than inventing a path from a blank field.
 */
export function resolveCreateTarget(
  projectRoot: string,
  request: CreateRequest,
  opts: MarketplaceOptions = {}
): CreateTarget {
  const errors = validateCreateRequest(projectRoot, request, opts);
  if (errors.length) throw new Error(errors.join(" "));

  switch (request.kind) {
    case "create-skill": {
      const name = request.name.trim() || deriveName(request.idea, "new-skill");
      const mp = request.target === "marketplace" ? marketplacePath(request.marketplace, opts)! : "";
      const dir =
        request.target === "project"
          ? path.join(projectRoot, ".claude", "skills", name)
          : path.join(mp, "plugins", request.plugin, "skills", name);
      return { name, path: path.join(dir, "SKILL.md"), marketplacePath: mp };
    }
    case "create-subagent": {
      const body = request.mode === "auto" ? request.idea : request.description;
      const name = request.name.trim() || deriveName(body, "new-agent");
      const mp = request.target === "marketplace" ? marketplacePath(request.marketplace, opts)! : "";
      // A project subagent is one file under .claude/agents/; a marketplace one is a directory
      // with an AGENTS.md, because that is the layout a plugin distributes.
      const file =
        request.target === "project"
          ? path.join(projectRoot, ".claude", "agents", `${name}.md`)
          : path.join(mp, "plugins", request.plugin, "agents", name, "AGENTS.md");
      return { name, path: file, marketplacePath: mp };
    }
    case "create-plugin": {
      const name = request.name.trim();
      const mp = marketplacePath(request.marketplace, opts)!;
      return { name, path: path.join(mp, "plugins", name), marketplacePath: mp };
    }
    case "create-marketplace": {
      const dir = request.targetDir.trim().replace(/\/+$/, "") || request.targetDir.trim();
      return { name: request.name.trim(), path: dir, marketplacePath: dir };
    }
  }
}

// ── all-or-nothing writes ────────────────────────────────────────────────────────────────────

/** One change to the filesystem. A flow declares its whole list before any of it runs. */
type Step =
  | { kind: "file"; file: string; contents: string }
  | { kind: "dir"; dir: string }
  /** Rewrite an existing JSON file. Its previous bytes are restored if a later step fails. */
  | { kind: "patch"; file: string; patch: (json: Record<string, unknown>) => Record<string, unknown> };

interface Applied {
  written: string[];
  undo: Array<() => void>;
}

/** Create `dir` and every missing ancestor, recording each one so a rollback can remove it. */
function mkdirTracked(dir: string, applied: Applied): void {
  const missing: string[] = [];
  for (let cur = dir; !fs.existsSync(cur); cur = path.dirname(cur)) {
    missing.unshift(cur);
    if (path.dirname(cur) === cur) break;
  }
  if (!missing.length) return;
  fs.mkdirSync(dir, { recursive: true });
  // Pushed shallowest-first, because the rollback runs the stack in REVERSE — so the deepest
  // directory is removed first and each parent is empty by the time its own undo runs. Pushing
  // them deepest-first reads more naturally and leaves every parent behind. And each undo removes
  // only a still-empty directory: a rollback must never delete one something else has filled.
  for (const created of missing) {
    applied.undo.push(() => {
      try {
        if (fs.existsSync(created) && fs.readdirSync(created).length === 0) fs.rmdirSync(created);
      } catch {
        /* leaving an empty directory behind is not worth failing a rollback over */
      }
    });
  }
}

/**
 * Run every step, or none of them.
 *
 * The pre-check refuses to clobber: an existing artifact is left exactly as it is, and the caller
 * says so. Everything after it is undoable, so a permission error on the fourth write does not
 * leave the first three behind claiming success.
 */
function apply(steps: Step[]): { ok: true; written: string[] } | { ok: false; reason: string } {
  for (const step of steps) {
    if (step.kind === "file" && fs.existsSync(step.file)) {
      return { ok: false, reason: `${step.file} already exists — nothing was written.` };
    }
    if (step.kind === "patch" && !fs.existsSync(step.file)) {
      return { ok: false, reason: `${step.file} does not exist — nothing was written.` };
    }
  }

  const applied: Applied = { written: [], undo: [] };
  try {
    for (const step of steps) {
      if (step.kind === "dir") {
        mkdirTracked(step.dir, applied);
      } else if (step.kind === "file") {
        mkdirTracked(path.dirname(step.file), applied);
        fs.writeFileSync(step.file, step.contents);
        applied.written.push(step.file);
        applied.undo.push(() => fs.rmSync(step.file, { force: true }));
      } else {
        const before = fs.readFileSync(step.file, "utf8");
        applied.undo.push(() => fs.writeFileSync(step.file, before));
        const json = JSON.parse(before) as Record<string, unknown>;
        fs.writeFileSync(step.file, JSON.stringify(step.patch(json), null, 2) + "\n");
      }
    }
    return { ok: true, written: applied.written };
  } catch (err) {
    for (const undo of [...applied.undo].reverse()) {
      try {
        undo();
      } catch {
        /* best effort: report the original failure, not a failure to clean up after it */
      }
    }
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

// ── the artifacts themselves ─────────────────────────────────────────────────────────────────

function quoteYaml(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** The body an auto-mode run replaces. Deliberately obvious, so a run that failed is visible. */
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

/** The description the preview showed. Same helper, same clip — the file cannot disagree with it. */
function description(mode: "auto" | "manual", idea: string, triggers: string[], what: string): string {
  return clip(
    buildDesc(mode, idea, triggers, {
      manualFallback: `<short description of what this ${what} does>`,
      whatFallback: `<what this ${what} does>`,
    }),
    140
  );
}

function stepsFor(
  target: CreateTarget,
  request: CreateRequest
): { steps: Step[]; remaining: string; needsModel: boolean } {
  switch (request.kind) {
    case "create-skill": {
      const desc = description(request.mode, request.idea, request.useWhen, "skill");
      const body = request.mode === "manual" ? manualSkillBody() : AUTO_BODY_PLACEHOLDER;
      const contents =
        `---\nname: ${target.name}\ndescription: "${quoteYaml(desc)}"\n---\n\n` +
        `# ${titleFromName(target.name)}\n\n${body}\n`;
      return {
        steps: [{ kind: "file", file: target.path, contents }],
        remaining:
          request.mode === "auto"
            ? "Author the SKILL.md body from the idea, replacing the placeholder."
            : "Skeleton is complete; refine the instructions if needed.",
        needsModel: request.mode === "auto",
      };
    }

    case "create-subagent": {
      const body = request.mode === "auto" ? request.idea : request.description;
      const desc = description(request.mode, body, request.triggers, "subagent");
      const toolsLine = request.tools.length ? `\ntools: ${request.tools.join(", ")}` : "";
      const skeleton =
        request.mode === "manual" ? manualAgentBody(target.name, request.triggers) : AUTO_BODY_PLACEHOLDER;
      const contents =
        `---\nname: ${target.name}\ndescription: "${quoteYaml(desc)}"${toolsLine}\n---\n\n` +
        `# ${titleFromName(target.name)}\n\n${skeleton}\n`;
      return {
        steps: [{ kind: "file", file: target.path, contents }],
        remaining:
          request.mode === "auto"
            ? "Author the AGENTS.md body (role, when-to-apply, workflow, output) from the idea."
            : "Skeleton is complete; fill in the workflow steps.",
        needsModel: request.mode === "auto",
      };
    }

    case "create-plugin": {
      const name = target.name;
      const desc = request.description.trim();
      // Inherit the author from the marketplace manifest: deterministic, and it saves a form field
      // whose only honest answer is already sitting in the file next door.
      const author = marketplaceOwner(target.marketplacePath);
      const manifest = {
        name,
        version: "0.1.0",
        description: desc,
        ...(author ? { author } : {}),
        keywords: request.keywords,
      };
      return {
        steps: [
          {
            kind: "file",
            file: path.join(target.path, ".claude-plugin", "plugin.json"),
            contents: JSON.stringify(manifest, null, 2) + "\n",
          },
          { kind: "dir", dir: path.join(target.path, "skills") },
          // Registration is a step like any other, so a marketplace.json that cannot be rewritten
          // rolls the plugin back instead of leaving one no marketplace lists.
          {
            kind: "patch",
            file: path.join(target.marketplacePath, ".claude-plugin", "marketplace.json"),
            patch: (json) => {
              const plugins = Array.isArray(json.plugins)
                ? (json.plugins as Array<{ name?: string; source?: string; description?: string }>)
                : [];
              if (!plugins.some((p) => p?.name === name)) {
                plugins.push({ name, source: `./plugins/${name}`, description: desc });
              }
              return { ...json, plugins };
            },
          },
        ],
        remaining: "Plugin manifest written and registered. Add a README, then skills or agents.",
        needsModel: false,
      };
    }

    case "create-marketplace": {
      const manifest = {
        name: target.name,
        owner: { name: request.ownerName.trim(), email: request.ownerEmail.trim() },
        metadata: {
          description: request.description.trim(),
          version: "0.1.0",
          ...(request.homepage.trim() ? { homepage: request.homepage.trim() } : {}),
        },
        plugins: [] as unknown[],
      };
      return {
        steps: [
          {
            kind: "file",
            file: path.join(target.path, ".claude-plugin", "marketplace.json"),
            contents: JSON.stringify(manifest, null, 2) + "\n",
          },
          {
            kind: "file",
            file: path.join(target.path, "README.md"),
            contents: `# ${target.name}\n\n${request.description.trim()}\n`,
          },
          { kind: "dir", dir: path.join(target.path, "plugins") },
        ],
        remaining:
          "Enrich README.md and add a CLAUDE.md context file; set up git / private-repo and auto-update per /create-marketplace.",
        needsModel: true,
      };
    }
  }
}

/**
 * Write everything this request implies that does not need a model.
 *
 * No model is involved, and none can be: nothing here calls out to anything. That is the whole
 * point of the split — the user sees the artifact appear the instant they press Create, and the
 * bridge is offered afterwards for the one part (a skill's prose, an agent's system prompt) that
 * genuinely needs one.
 */
export function scaffoldCreate(
  projectRoot: string,
  request: CreateRequest,
  opts: MarketplaceOptions = {}
): ScaffoldResult {
  const errors = validateCreateRequest(projectRoot, request, opts);
  if (errors.length) {
    return {
      scaffolded: false,
      name: "",
      path: "",
      written: [],
      remaining: "",
      needsModel: false,
      reason: errors.join(" "),
    };
  }

  const target = resolveCreateTarget(projectRoot, request, opts);
  const { steps, remaining, needsModel } = stepsFor(target, request);
  const res = apply(steps);

  if (!res.ok) {
    return {
      scaffolded: false,
      name: target.name,
      path: target.path,
      written: [],
      remaining: "",
      needsModel: false,
      reason: res.reason,
    };
  }
  return { scaffolded: true, name: target.name, path: target.path, written: res.written, remaining, needsModel };
}
