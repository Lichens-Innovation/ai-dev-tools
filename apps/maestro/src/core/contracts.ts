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
  /**
   * What became of the artifact's git repository. Present only for the flows that make one — a
   * skill or a plugin is written INTO a repository somebody else already owns.
   */
  repo?: RepoResult;
}

/**
 * Whether the scaffold left a repository behind, and what to tell the user either way.
 *
 * There is always something to say. A repository was created, or the directory already sat inside
 * one, or `git` is not on this machine — and the last two are not failures: the marketplace on disk
 * is complete and usable in all three, which is why this is a field on a successful result rather
 * than a reason on a failed one.
 */
export interface RepoResult {
  /** True when THIS scaffold ran `git init` and committed what it wrote. */
  initialized: boolean;
  /** The repository: the one created, or the one the directory turned out to be inside. */
  root: string | null;
  /** Plain-English account — what happened, or why nothing did. Always worth showing. */
  note: string;
}

/**
 * Making a directory a git repository — the one scaffold step `fs` alone cannot do.
 *
 * It is a PORT the caller supplies rather than an import, and that is not ceremony.
 * `claude-preview.ts` imports `scaffold.ts` for `resolveCreateTarget`, and
 * `test/core/claude.test.ts` walks the preview's import graph to prove it cannot start a process.
 * A `child_process` import inside the scaffold's graph would take that guarantee away for a
 * capability the preview never uses. So the composition root (`src/main/ipc.ts`) hands the scaffold
 * a `nodeGit()` from `src/core/git.ts`, and the scaffold stays a pure function of the form, the
 * filesystem and this interface.
 */
export interface GitPort {
  /** Whether the `git` binary is here at all, and where it was looked for. Never spawns. */
  availability(): { available: boolean; reason: string };
  /** `git init` in `dir`; returns the `.git` it created, so a rollback has a handle on it. */
  init(dir: string): string;
  /** Stage everything under `dir` and make the first commit. Throws git's own message on failure. */
  commit(dir: string, message: string, author: { name: string; email: string }): void;
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
 *
 * `help-chat` is here for the same reason and is the interesting one: help-server ran the chat by
 * spawning `claude` itself, with no preview and no confirmation. It carries the user's own prose,
 * which `create-skill`'s `idea` always did too — what matters is that the SENTENCE AROUND it is
 * still built in `claude-preview.ts`, and that the result is shown before it can run.
 */
export type ClaudeRequest =
  | {
      kind: "maestro-task";
      /** Basename of a file in `.claude/maestro-tasks/`. Resolved and existence-checked by preview. */
      filename: string;
    }
  | {
      kind: "help-chat";
      /** The question, as typed. Trimmed, length-capped and wrapped into a prompt by preview. */
      message: string;
      /**
       * The exchange so far, so a follow-up question means something.
       *
       * Sent from the renderer rather than remembered in main, ON PURPOSE: it is then part of the
       * prompt the preview displays, and "the user saw exactly what ran" holds on the tenth
       * message as much as the first. Only the last few turns survive into the prompt.
       */
      history: ChatTurn[];
    }
  | CreateRequest;

/** One side of a help-chat exchange, as it rides along on the next question. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** A path the run may write, and how. Shown in the confirmation before anything is spawned. */
export interface ClaudeWriteTarget {
  /** Absolute path. A directory means "somewhere under here". */
  path: string;
  action: "create" | "modify" | "unknown";
  /** Why it's uncertain, when it is — the modal renders this verbatim rather than guessing. */
  note?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// What a run can READ — the larger half of the disclosure, and the quieter one.
//
// Writes announce themselves: a create-* prompt names its file, the list below is on screen, and
// the session's permission callback allows nothing outside it. Reads announce nothing: file reads
// and searches are auto-approved by the permission system and never raise a prompt, so the
// directory list a session is started with
// IS the bound on what the model can see — and it is fully known before anything spawns.
//
// The types below exist so the confirmation can state that bound *truthfully*. The effective
// configuration of a session is not what the app passes: it is the app's arguments merged with the
// settings files on disk, which can add readable directories and permission rules the app never
// chose. So the disclosure is built from a real resolution of those files (`SettingsPort`), and
// every value carries where it came from rather than being flattened into one confident list.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A tier of Claude Code's settings cascade, in the CLI's own vocabulary.
 *
 * `user` (~/.claude/settings.json), `project` (.claude/settings.json, committed), `local`
 * (.claude/settings.local.json, ignored), `managed` (the admin policy tier) and `flag` (a
 * `--settings` file). Listed low→high precedence wherever a list of these appears.
 */
export type SettingsTier = "user" | "project" | "local" | "managed" | "flag";

/** The permission-bearing slice of a settings file — the only part this disclosure is about. */
export interface SettingsPermissions {
  /** `permissions.additionalDirectories` — trees a session may read beyond its working directory. */
  additionalDirectories: string[];
  allow: string[];
  deny: string[];
  ask: string[];
  /** `permissions.defaultMode`, or null when the tier does not set one. */
  defaultMode: string | null;
}

/** One tier of the cascade: where its file is, and what it holds. */
export interface SettingsSourceInfo {
  tier: SettingsTier;
  /** Absolute path of the file, when the tier has one on disk. Null for computed tiers. */
  path: string | null;
  /** Raw, as written in that file — NOT merged. Attribution is done against these. */
  permissions: SettingsPermissions;
}

/**
 * The effective settings a run would see, plus every tier that contributed to them.
 *
 * `effective` is the merge engine's own answer and is what the run actually gets; `sources` is what
 * each file said, and is how a value in `effective` is attributed to a file. Reported separately
 * on purpose: recomputing the merge here to work out provenance would make this a second, drifting
 * implementation of a cascade the CLI already owns.
 */
export interface EffectiveSettingsSnapshot {
  /** Low→high precedence. */
  sources: SettingsSourceInfo[];
  effective: SettingsPermissions;
}

/**
 * Resolving the settings cascade — the one thing the preview cannot do for itself.
 *
 * A PORT for the same reason `GitPort` is one: the resolution lives in the Agent SDK, and
 * `claude-preview.ts` must import nothing that can start a process (`test/core/claude.test.ts`
 * walks its import graph). So `src/core/agent-sdk.ts` implements this and `src/main/ipc.ts` — the
 * composition root — hands it over. Omitting it is not an error: the disclosure then says the
 * settings files were not consulted, which is honest, rather than listing the app's intent as
 * though it were the effective configuration.
 */
export interface SettingsPort {
  /** Resolve the cascade as it applies to a run in `cwd`. Never spawns the `claude` CLI. */
  resolve(cwd: string): Promise<EffectiveSettingsSnapshot>;
}

/** Where a readable directory came from: the run's own working directory, or a settings file. */
export type ReadScopeOrigin = "cwd" | "settings";

/** A tree the run can read. Everything under it, with no prompt at any point. */
export interface ClaudeReadDirectory {
  /** Absolute path. */
  path: string;
  origin: ReadScopeOrigin;
  /** Which tier put it in scope. Null for the working directory, which the app chose. */
  tier: SettingsTier | null;
  /** The settings file it came from, when there is one. */
  file: string | null;
  /** Why it is readable, in a sentence the dialog renders verbatim. */
  note: string;
}

/** One permission rule the effective settings carry, and which file it came from. */
export interface ClaudePermissionRule {
  list: "allow" | "deny" | "ask";
  /** The rule as written, e.g. `Bash(git push:*)`. */
  rule: string;
  /** Null when the rule is in the merged result but in none of the files that were read. */
  tier: SettingsTier | null;
  file: string | null;
}

/**
 * Everything the confirmation says about what a run may SEE, as opposed to change.
 *
 * `summary` is derived here rather than in the renderer for the same reason every path is: the
 * renderer must not be the thing that decides what the user is told about a run.
 */
export interface ClaudeReadScope {
  /** Every tree in scope, working directory first. */
  directories: ClaudeReadDirectory[];
  /** The project the window has open. "" when there is none. */
  projectRoot: string;
  /** The open project is inside one of `directories` — the run can see what the user is looking at. */
  projectReadable: boolean;
  /** Write targets that sit outside every readable tree: the run writes where it cannot look. */
  writesOutsideReadScope: string[];
  /** Plain-English account of the read/write relationship. Rendered verbatim. */
  summary: string;
  /** Permission rules in the EFFECTIVE settings. The app itself passes none. */
  rules: ClaudePermissionRule[];
  /** Rules beyond the cap, counted rather than listed — a wall of text is not a disclosure. */
  rulesOmitted: number;
  /** Every tier consulted, low→high, with its file and its raw contribution. */
  sources: SettingsSourceInfo[];
  /** The merged `permissions.defaultMode` and where it came from, after the CLI's trust filter. */
  defaultMode: { mode: string; tier: SettingsTier | null } | null;
  /**
   * Set when the cascade could not be resolved: the list is then the app's own intent and nothing
   * more. Never left null to mean "there was nothing" — the two are different answers.
   */
  unresolved: string | null;
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
  /**
   * The EQUIVALENT command line, with argv[0] the resolved binary — what to run to reproduce this
   * yourself, which is what Copy prompt is for. The app runs it as an Agent SDK session, which adds
   * its own stream-protocol flags; the exact argv that was spawned comes back on `ClaudeRunResult`.
   */
  argv: string[];
  cwd: string;
  targets: ClaudeWriteTarget[];
  /**
   * What the run can read — the other half of `targets`, and the bigger one.
   *
   * Never optional. A preview without it would be a confirmation that silently says nothing about
   * the largest thing it is granting, which is precisely the state this field exists to end.
   */
  read: ClaudeReadScope;
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
 * The four outcomes are distinguishable on purpose. "Failed" means the session ran and ended badly —
 * `error` says how, and the output is worth reading. "Crashed" means it never ran, or died on a
 * signal — the message is about the machine, not the prompt. Collapsing them into `ok: false` throws
 * away which of those two the user is looking at.
 */
export interface ClaudeRunResult {
  outcome: "ok" | "failed" | "crashed" | "cancelled";
  /**
   * 0 on success, null otherwise. A session is not a process exit: the CLI is a child the SDK owns,
   * and "why it ended" arrives as a result message rather than as a status. `error` carries that,
   * and is the field to render — a code here would be invented.
   */
  code: number | null;
  signal: string | null;
  /** Why it is not `ok`: a spawn-level failure, or the reason the session ended. */
  error: string | null;
  /** Everything the run wrote, also delivered as it arrived. Both are surfaced on every outcome. */
  stdout: string;
  stderr: string;
  /** Output exceeded the retained cap; the tail is kept and the head dropped. */
  truncated: boolean;
  durationMs: number;
  /**
   * What was ACTUALLY spawned, captured from the SDK's own spawn options — so it carries the
   * protocol flags the SDK adds and will not match the equivalent argv the modal displayed.
   */
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

// ─────────────────────────────────────────────────────────────────────────────
// The read-only surface folded in from apps/help-server (docs/plans/m6-help-server-merge.md).
//
// These describe what the machine and the open project ALREADY contain — installed plugins, the
// project's own marketplace manifest, the curated marketplaces' cache, the rule library, the CLI
// command table, the docs. Nothing here is written by the app, which is why the whole group is a
// single loader payload per view rather than a channel per question.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A plugin installed for this machine, as `~/.claude/plugins/installed_plugins.json` records it.
 *
 * Narrower than `@repo/claude-fs`'s `InstalledPlugin` on purpose: `installPath` and `projectPath`
 * are absolute paths on this machine that no view renders, and a contract carries what crosses,
 * not what the reader happened to have.
 */
export interface InstalledPluginInfo {
  /** `<plugin>@<marketplace>` — the key `claude plugin install` uses. */
  key: string;
  pluginName: string;
  marketplace: string;
  /** "user" or "project". */
  scope: string;
  version: string;
  /** ISO timestamp; "" when the record predates the field. */
  installedAt: string;
}

/** A skill or subagent contributed by a plugin, as the marketplace tab lists it. */
export interface DefinitionSummary {
  name: string;
  description: string;
}

/** A plugin listed in the OPEN PROJECT's own `.claude-plugin/marketplace.json`. */
export interface MarketplacePluginInfo {
  name: string;
  description: string;
  version: string;
  skills: DefinitionSummary[];
  agents: DefinitionSummary[];
  /** Whether `<name>@<this marketplace>` is installed on this machine. */
  isInstalled: boolean;
  installCommand: string;
}

/** A plugin from one of the curated marketplaces, read out of `~/.claude`'s marketplace cache. */
export interface CuratedPlugin {
  name: string;
  marketplace: string;
  /** Display name for the marketplace, e.g. "Anthropic Official". */
  marketplaceLabel: string;
  description: string;
  isInstalled: boolean;
  installCommand: string;
}

/**
 * A rule file in the project's `rules/` LIBRARY — authored rules, before any assignment.
 *
 * Deliberately not a `ProjectRule`, and deliberately not produced by `discoverProjectRules`.
 * The two answer different questions about overlapping files: this one is "what does this repo
 * publish", read from `<project>/rules/*.md`; `ProjectRule` is "what is assigned where", read
 * from every `.claude/rules/` in the tree, and is what a save MOVES. Naming both "rules" is what
 * the merge plan warned about, so the library keeps `title`/`paths` (its frontmatter) and the
 * assignable one keeps `id`/`dir`.
 */
export interface RuleLibraryEntry {
  filename: string;
  /** First `# heading`, falling back to the filename. */
  title: string;
  /** `paths:` frontmatter — which files the rule claims to apply to. Empty means all. */
  paths: string[];
  description: string;
}

/** A row of the CLI command table in `<project>/docs/claude-code.md`. */
export interface ClaudeCommand {
  command: string;
  description: string;
}

/** A markdown file under `<project>/docs/`. */
export interface DocMeta {
  slug: string;
  title: string;
}

/**
 * One heading's worth of a doc, which is the unit docs search matches against.
 *
 * Per-heading rather than per-file so a hit can deep-link to `#headingId` and the reader can
 * highlight the term in place — searching whole files would only ever be able to name the file.
 */
export interface DocSection {
  slug: string;
  docTitle: string;
  /** Slugified heading text; the `id` the reader puts on the rendered heading. */
  headingId: string;
  headingText: string;
  bodyText: string;
}

/** A doc's rendered body, as `data:doc` returns it. */
export interface DocContent {
  slug: string;
  title: string;
  content: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage stats — the one feature in the app whose tool may be FETCHED FROM THE NETWORK.
// See `src/core/ccusage.ts` for the decision and its reasoning; these shapes exist to let the UI
// state, before anything runs, which of the two it is about to do.
// ─────────────────────────────────────────────────────────────────────────────

/** Which slice of usage to ask ccusage for. Each is one subcommand. */
export type UsageStatsView = "session" | "blocks" | "daily" | "monthly";

/**
 * Where the `ccusage` that would run comes from.
 *
 * `local` — an executable already on this machine. Nothing is downloaded.
 * `npx` — no local copy, so a PINNED version would be fetched from npm and executed.
 * `none` — neither a local copy nor `npx`. Nothing can run, and the UI says so instead of
 *          discovering it at spawn time.
 */
export type CcusageSource = "local" | "npx" | "none";

/** Tokens and cost for one slice of usage. */
export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

/**
 * What `ccusage <view> --json` reduces to.
 *
 * Deliberately not help-server's forty flat fields (`latestSessionInputTokens`,
 * `totalMonthlyTotalTokens`, …), which were one naming scheme per view for the same four numbers.
 * The view is a field, the numbers are a shape, and a tab that adds a view adds no contract.
 */
export interface UsageStats {
  view: UsageStatsView;
  /** Rows ccusage returned: sessions, blocks, days or months. */
  entryCount: number;
  /** What the most recent row is called — a date, a month, a session id. "" when there are none. */
  latestLabel: string;
  /** The most recent row. */
  latest: UsageTotals;
  /** Every row summed. */
  total: UsageTotals;
  /** `blocks` only: how many are still open. */
  activeBlocks: number;
  /** `daily` only: the last seven days summed. Null for every other view. */
  recent: UsageTotals | null;
  /** ISO date (`YYYY-MM-DD`) of the newest row, "" when there are none. */
  lastUpdated: string;
}

/**
 * What would run to produce those stats — returned BEFORE anything is spawned.
 *
 * The whole reason this channel exists separately from a "get me the stats" call: with `source:
 * "npx"` the act of answering downloads a package from npm and executes it on the user's machine,
 * and that is a thing to be told about rather than to discover from a network graph.
 */
export interface UsageStatsPreview {
  /** Single-use, time-limited authorisation to run exactly `argv`. Null when nothing can run. */
  token: string | null;
  view: UsageStatsView;
  source: CcusageSource;
  /** Exactly what will be spawned, argv[0] resolved. Shown verbatim. */
  argv: string[];
  cwd: string;
  /** True when running `argv` fetches a package from the network. Drives what the UI has to say. */
  network: boolean;
  /** The version a network fetch would install — pinned, never `@latest`. */
  pinnedVersion: string;
  /** Absolute path of the local `ccusage`, when one was found. */
  bin: string | null;
  /** Directories searched, in order — the "we looked here" of a not-found message. */
  searched: string[];
  /** Set only when `source` is "none": what is missing and what to install. */
  unavailable: string | null;
  expiresAt: number;
}

/** How a usage-stats run ended. Every failure is a value here, never an exception at the UI. */
export interface UsageStatsResult {
  view: UsageStatsView;
  ok: boolean;
  /** Null when the run failed. */
  stats: UsageStats | null;
  /** Why it failed, in a sentence the UI shows as-is. Null on success. */
  error: string | null;
  /** What actually ran — diffable against the argv the preview displayed. */
  argv: string[];
  durationMs: number;
}
