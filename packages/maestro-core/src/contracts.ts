// Every type that crosses a process boundary, in one dependency-free module.
//
// Why this is separate from the modules that produce these values: the desktop renderer needs
// the shapes, but must never pull in the code. `@repo/maestro-core`'s barrel re-exports fs,
// child_process, and import.meta.dirname; a renderer that imports a type from it drags all of
// that into its type graph (and, if anyone ever writes a value import by mistake, into its
// bundle). Importing from `@repo/maestro-core/contracts` cannot do that — there is nothing here
// but interfaces.
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
