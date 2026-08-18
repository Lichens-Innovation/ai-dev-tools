// Every type that crosses a process boundary, in one dependency-free module.
//
// Why this is separate from the modules that produce these values: the desktop renderer needs
// the shapes, but must never pull in the code. `./index.js` re-exports fs and child_process; a
// renderer that imports a type from it drags all of that into its type graph (and, if anyone ever
// writes a value import by mistake, into its bundle). Importing from `./contracts.js` cannot do
// that — there is nothing here but interfaces.
//
// The two differ by one word in an import line, which is why the boundary is asserted rather than
// left to review: see the "src/core boundary" block in test/isolation.test.ts.
//
// The implementation modules import these back, so there is still exactly one definition of each.

export type {
  MaestroConfigV3,
  MaestroInstanceV3,
  MaestroNodeV3,
  MaestroEdgeV3,
  MaestroWorkflowV3,
  MaestroRuleV3,
  MaestroWorkflowsSlice,
  MaestroRulesSlice,
  MaestroSession,
} from "./types.js";

import type { MaestroConfigV3 } from "./types.js";

/**
 * Where an agent/skill was discovered: "project", "user" (global ~/.claude), the bundled
 * Maestro plugin, or an installed plugin's name.
 */
export interface DiscoveredDefinition {
  id: string;
  description: string;
  source: string;
}

export interface ProjectRule {
  id: string;
  description: string;
  body: string;
  /** Project-relative dir whose .claude/rules holds this file; "" = project root. */
  dir: string;
}

export interface TreeNode {
  /** Relative to the project root. */
  path: string;
  name: string;
  depth: number;
}

export type TaskStatus = "done" | "ready" | "blocked";

export interface MaestroTask {
  filename: string;
  /** Project-relative path — what the copy-prompt tells Claude Code to implement. */
  relativePath: string;
  title: string;
  blockedBy: string[];
  status: TaskStatus;
  content: string;
}

export interface SessionLogEntry {
  ts: string;
  origin: string;
  log: string;
  /** Set on dispatch/handoff entries written by maestro-subagent-log.js. */
  kind?: "dispatch" | "handoff" | "transition";
  /** dispatch: the subagent's agent_type */
  agent?: string;
  /** shared key linking a dispatch↔handoff pair */
  agent_id?: string;
  /** dispatch only: full spawning message (main session → agent) */
  input?: string;
  /** dispatch only: skills the SubagentStart hook surfaced */
  offered_skills?: { loaded: string[]; referenced: string[] };
  /** handoff only */
  status?: "success" | "condition" | "unknown";
  /** handoff only */
  label?: string | null;
  /** handoff only: full final message (agent → main session) */
  output?: string;
}

export interface RenderResult {
  ok: boolean;
  reason?: "maestro.json not found" | "maestro/SKILL.md not found";
  rows: Array<{ workflow: string; successPath: string }>;
}

export interface ApplyRulesSummary {
  moved: Array<{ id: string; from: string; to: string }>;
  installed: Array<{ id: string; dir: string }>;
  unchanged: Array<{ id: string; dir: string }>;
  skipped: Array<{ id: string; dir: string; reason: string }>;
  /** Project rules whose file wasn't found anywhere in the tree. */
  missing: string[];
  errors: Array<{ id: string; error: string }>;
}

/**
 * What the repo looks like it is, and why — the seed for an unconfigured project's happy path.
 *
 * `evidence` is the half that makes this usable. The heuristic is occasionally wrong; a user shown
 * "`react`, `express` in package.json → …" can see *why* it was wrong and correct the chain before
 * saving. The same result with no evidence would just be an unexplained choice to trust.
 */
export interface RepoDetection {
  /** The implementation-agent chain, in happy-path order. Never empty. */
  implAgents: string[];
  /** Human-readable lines naming what matched, e.g. "`react-dom` in package.json → frontend". */
  evidence: string[];
  /** Nothing matched: `implAgents` is the safe default rather than a conclusion about this repo. */
  fallback: boolean;
}

/** What installing the orchestrator skill did to an existing file. All four are load-bearing. */
export type OrchestratorSkillAction = "installed" | "synced" | "unchanged" | "migrated";

/**
 * Whether Maestro's runtime half is wired into the open project, and whether it matches what the
 * app ships.
 *
 * Staleness is decided by CONTENT, never by mtime: `installedRuntimeId` and `shippedRuntimeId`
 * are sha-256 digests over the runtime files themselves, so two checkouts of the same commit
 * agree and a `git clone` (which rewrites every mtime) doesn't spuriously report an update.
 */
export interface InstallStatus {
  projectRoot: string;
  /** The orchestrator skill and the copied scripts directory both exist. */
  installed: boolean;
  orchestratorSkill: boolean;
  scriptsDir: boolean;
  configFile: boolean;
  /** The installed SKILL.md's plugin-owned regions differ from the template the app ships. */
  orchestratorSkillOutOfDate: boolean;
  /** Project-relative paths of runtime files that are absent / differ from the shipped copy. */
  scriptsMissing: string[];
  scriptsOutOfDate: string[];
  /** Hook ids (`<Event>:<script>`) registered in the project's settings, and those still absent. */
  hooksRegistered: string[];
  hooksMissing: string[];
  /** Digest of the runtime the app ships vs. the copy in the project. Equal ⇒ files are current. */
  shippedRuntimeId: string;
  installedRuntimeId: string;
  /** Installed, but something is missing or older than what the app ships. */
  stale: boolean;
  /**
   * The ai-tools-manager plugin is installed for this machine, so its hooks.json registers the
   * same runtime hooks globally — every tool call would be logged twice. The app never edits the
   * user's global configuration, so this is reported, not fixed.
   */
  pluginHooksActive: boolean;
  /** `.claude/settings.json` exists but is not valid JSON — install would refuse to touch it. */
  settingsUnreadable: boolean;
}

/** What an install actually changed on disk. */
export interface InstallReport {
  projectRoot: string;
  orchestratorSkill: {
    action: OrchestratorSkillAction;
    /** Plugin-owned regions re-synced from the template (`action: "synced"`). */
    regions: string[];
    /** Where the pre-managed-regions body was kept (`action: "migrated"`). */
    backup: string | null;
  };
  /** Project-relative paths of runtime files written (absent or differing before). */
  scriptsWritten: string[];
  /** Hook ids added to the project's `.claude/settings.json`. */
  hooksAdded: string[];
  gitignoreUpdated: boolean;
  /** True when the run found nothing to do — the idempotent second run. */
  unchanged: boolean;
  warnings: string[];
  /** Recomputed after the writes, so the caller can refresh its badge without a second call. */
  status: InstallStatus;
}

/**
 * What each level of an uninstall would remove from the project, as it stands right now.
 *
 * This exists so the UI can NAME the files before it deletes them. "Are you sure?" is not informed
 * consent when `.claude/maestro.json` — hand-authored workflow and rule configuration — is on the
 * list, so the confirmation renders `purgeFiles` verbatim.
 */
export interface UninstallPlan {
  projectRoot: string;
  /** Hook ids (`<Event>:<script>`) currently registered that a default uninstall would remove. */
  hooks: string[];
  /** Project-relative paths of the ephemeral session files that exist right now. */
  sessionFiles: string[];
  /** `agent: "maestro"`, left in settings.json by installs that predate the hook registration. */
  legacyAgentSetting: boolean;
  /**
   * Project-relative paths a purge would delete ON TOP of the default — the orchestrator skill,
   * the copied runtime scripts, the installed handoff protocols, and `maestro.json`. Only paths
   * that exist are listed, so the confirmation never names a file the user doesn't have.
   */
  purgeFiles: string[];
  /** True when `maestro.json` exists — i.e. when purge has something irreplaceable to delete. */
  purgeRemovesConfig: boolean;
  /** Neither level has anything to do: uninstalling would be a no-op. */
  empty: boolean;
  /** `.claude/settings.json` exists but is not valid JSON — uninstall would refuse to touch it. */
  settingsUnreadable: boolean;
}

/** What an uninstall actually removed from disk. */
export interface UninstallReport {
  projectRoot: string;
  /** Which level ran. `false` is the default and never deletes `maestro.json`. */
  purge: boolean;
  /** Hook ids removed from the project's `.claude/settings.json`. */
  hooksRemoved: string[];
  /** Project-relative paths of the ephemeral session files deleted. */
  sessionFilesRemoved: string[];
  legacyAgentSettingRemoved: boolean;
  /** Project-relative paths deleted by a purge — empty on a default uninstall. */
  purged: string[];
  /** Directories left empty by the deletions and pruned. Never `.claude` itself. */
  dirsPruned: string[];
  /**
   * `.claude/maestro.json` is still on disk. Always true after a default uninstall of a project
   * that had one — the whole point of the two levels.
   */
  configKept: boolean;
  /** There was nothing installed to remove. Nothing was written; this is not an error. */
  noop: boolean;
  warnings: string[];
  /** Recomputed after the deletions, so the caller can refresh its badge without a second call. */
  status: InstallStatus;
}

/** A local plugin marketplace the create forms can write into, and what it already holds. */
export interface MarketplaceEntry {
  name: string;
  /** Absolute path of the marketplace repo on this machine. */
  path: string;
  /** Plugin names listed in its `.claude-plugin/marketplace.json`. */
  plugins: string[];
  /**
   * Its owner, which a new plugin inherits as its `author`.
   *
   * Carried so the plugin form can PREVIEW the author it is about to write. The form never asks
   * for one — the honest answer already sits in the marketplace's manifest — and a field the user
   * cannot predict is exactly the kind the preview has to show.
   */
  owner: { name: string; email: string } | null;
}

/** What a create route needs to populate its selectors: the marketplaces, and where they are. */
export interface CreateOptions {
  marketplaces: MarketplaceEntry[];
  /** The open project's root, or "" — where `target: "project"` writes. */
  projectRoot: string;
}

/**
 * One create-* form's answers, as they cross the process boundary.
 *
 * Note what is NOT on these: a destination path. `target: "project"` means the open project, which
 * only the main process knows, and `marketplace` is a NAME the user picked out of a list main
 * produced — main turns it back into a path. So the renderer describes an artifact; it never
 * nominates a directory to write in. The one exception is `create-marketplace.targetDir`, which is
 * the whole point of that form (the user is choosing where a brand-new marketplace goes) and is
 * validated as an absolute path and shown in the confirmation before anything is written.
 */
export type CreateSkillRequest = {
  kind: "create-skill";
  /** auto: Claude authors the body afterwards. manual: the skeleton is the finished artifact. */
  mode: "auto" | "manual";
  target: "marketplace" | "project";
  /** Blank derives one from `idea`, deterministically — a directory name cannot wait for a model. */
  name: string;
  /** The idea (auto) or the description (manual). */
  idea: string;
  useWhen: string[];
  marketplace: string;
  plugin: string;
};

export type CreateSubagentRequest = {
  kind: "create-subagent";
  mode: "auto" | "manual";
  target: "marketplace" | "project";
  name: string;
  idea: string;
  description: string;
  triggers: string[];
  tools: string[];
  marketplace: string;
  plugin: string;
};

export type CreatePluginRequest = {
  kind: "create-plugin";
  name: string;
  description: string;
  keywords: string[];
  marketplace: string;
};

export type CreateMarketplaceRequest = {
  kind: "create-marketplace";
  name: string;
  description: string;
  ownerName: string;
  ownerEmail: string;
  homepage: string;
  /** Absolute path of the directory to become the marketplace. */
  targetDir: string;
  privateRepo: boolean;
};

export type CreateRequest = CreateSkillRequest | CreateSubagentRequest | CreatePluginRequest | CreateMarketplaceRequest;

/**
 * What the deterministic scaffold wrote — no model involved in any of it.
 *
 * `scaffolded: false` is not a half-success: a failed scaffold leaves the disk exactly as it was
 * (see `scaffold.ts`), and `reason` is what to tell the user. The web app's third state — "the
 * target is outside the Docker mount, let Claude create it host-side" — is gone with the container;
 * every path on the host is reachable, so a failure here is a real failure.
 */
export interface ScaffoldResult {
  scaffolded: boolean;
  /**
   * The kebab-case name the artifact was actually created under.
   *
   * Worth returning because it is not always the one the form holds: a blank name is derived from
   * the idea, and the user has no other way to learn what it became.
   */
  name: string;
  /** Absolute path of the primary artifact: the file for a skill/agent, the directory otherwise. */
  path: string;
  /** Every file created, absolute. Empty when `scaffolded` is false. */
  written: string[];
  /** What is left for a model to do, in prose. "" when the artifact is already complete. */
  remaining: string;
  /**
   * `remaining` needs a model, so the route offers the bridge straight away rather than waiting to
   * be asked. False for a manual skeleton or a plugin manifest, which are finished as written.
   */
  needsModel: boolean;
  /** Why nothing was written. Set only when `scaffolded` is false. */
  reason?: string;
}

/**
 * What the user is asking Claude to do, as a shape the MAIN process knows how to turn into a
 * prompt — never the prompt itself.
 *
 * This is the reason the bridge is safe. If the renderer handed over prompt text, the set of
 * prompts the app can execute would be "any string a renderer bug can produce". Because it hands
 * over a request, the set is the small, enumerable list of things this union can express, and every
 * member of it is built by code in `claude-preview.ts` that a reviewer can read end to end.
 *
 * The four `create-*` kinds are here because those routes went through the bridge rather than
 * growing a spawn of their own: each is a prompt builder and an entry in the preview's `targets`,
 * and each names the artifact the deterministic scaffold has ALREADY written, so the run's job is
 * finishing a file rather than creating one.
 */
export type ClaudeRequest =
  | {
      kind: "maestro-task";
      /** Basename of a file in `.claude/maestro-tasks/`. Resolved and existence-checked by preview. */
      filename: string;
    }
  | CreateRequest;

/** A path the run may write, and how. Shown in the confirmation before anything is spawned. */
export interface ClaudeWriteTarget {
  /** Absolute path. A directory means "somewhere under here". */
  path: string;
  action: "create" | "modify" | "unknown";
  /** Why it's uncertain, when it is — the modal renders this verbatim rather than guessing. */
  note?: string;
}

/**
 * Everything the confirmation modal needs, and the token that makes the run possible.
 *
 * Producing one of these spawns nothing. That is not a description of the current implementation —
 * it is enforced by `claude-preview.ts` importing no module that can start a process.
 */
export interface ClaudePreview {
  /**
   * Single-use, time-limited authorisation to run exactly `argv` in exactly `cwd`.
   *
   * Null when the CLI is unavailable: there is nothing to authorise, so the UI has nothing to
   * enable. The prompt is still returned in full — copying it into a session by hand is the
   * documented fallback, and it must work in every state.
   */
  token: string | null;
  /** The full prompt text, shown verbatim and scrollable. Never a summary. */
  prompt: string;
  /** argv[0] is the resolved binary. This is exactly what is spawned — the modal shows it as-is. */
  argv: string[];
  cwd: string;
  targets: ClaudeWriteTarget[];
  available: boolean;
  /** Absolute path of the resolved CLI, or null. */
  bin: string | null;
  /** Directories searched to decide `available`, in order. */
  searched: string[];
  /** Set only when `available` is false: a message naming what was looked for and where. */
  unavailable: string | null;
  /** Epoch ms after which the token is refused. */
  expiresAt: number;
}

/** One piece of output as it arrives. Streamed; the UI never waits for completion to show output. */
export interface ClaudeOutputChunk {
  stream: "stdout" | "stderr";
  chunk: string;
}

/**
 * How a run ended.
 *
 * The four outcomes are distinguishable on purpose. "Non-zero exit" means the CLI ran and disagreed
 * with the request — its stderr is the explanation and is worth reading. "Crashed" means it never
 * ran, or died on a signal — the message is about the machine, not the prompt. Collapsing them into
 * `ok: false` throws away which of those two the user is looking at.
 */
export interface ClaudeRunResult {
  outcome: "ok" | "failed" | "crashed" | "cancelled";
  /** Exit status, null when the process died on a signal or never started. */
  code: number | null;
  signal: string | null;
  /** Spawn-level failure ("crashed"), with the path that could not be executed. */
  error: string | null;
  /** Everything the run wrote, also delivered as it arrived. Both are surfaced on every outcome. */
  stdout: string;
  stderr: string;
  /** Output exceeded the retained cap; the tail is kept and the head dropped. */
  truncated: boolean;
  durationMs: number;
  /** What actually ran — diffable against the argv the modal displayed. */
  argv: string[];
  cwd: string;
}

export interface SaveResult {
  /** Absolute path of the file written. */
  configPath: string;
  config: MaestroConfigV3;
  /**
   * `ok: false` with "maestro/SKILL.md not found" is the normal state for a project where
   * Maestro isn't installed yet — the config still saved.
   */
  render: RenderResult;
  rules: ApplyRulesSummary;
  /** Human-readable notes worth surfacing in the save toast. */
  warnings: string[];
}
