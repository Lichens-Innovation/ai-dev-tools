// The barrel for src/core — all node-side Maestro logic, framework-free.
//
// Imported by the app's main process (which exposes it over IPC) and, for the pure modules,
// re-bundled to CJS for the plugin's standalone Claude Code hook scripts by
// scripts/build-plugin-libs.mjs. Nothing here imports React, TanStack, or Electron.
//
// This barrel is MAIN-PROCESS ONLY: it re-exports modules that import fs and child_process. The
// renderer-safe surface is ./contracts.js (types) and ./text.js (pure string helpers), and
// test/isolation.test.ts fails if anything under src/{shared,preload,renderer} reaches past them.

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

export {
  resolveWorkflowName,
  resolveSearchList,
  collectAgentSkills,
  bareAgentName,
  nodeLabel,
  successPathSteps,
  workflowNodeLabels,
  type AgentSkills,
  type SearchListResult,
} from "./success-path.js";

export {
  MANAGED_REGIONS,
  RENDERED_REGIONS,
  startMarker,
  endMarker,
  extractRegion,
  replaceRegion,
  syncManagedRegions,
  type SyncResult,
} from "./skill-regions.js";

export {
  maestroJsonPath,
  blankConfig,
  readJsonSafe,
  readConfig,
  serializeConfig,
  writeConfig,
  mergeSlice,
  type ConfigSlice,
} from "./config.js";

export { orchestratorSkillPath, successPath, handoffTable, renderOrchestrator, type RenderResult } from "./render.js";

export {
  readStdin,
  readJson,
  readSession,
  writeSession,
  appendSessionLog,
  sessionLogPath,
  SESSION_LOG_FILE,
} from "./session-runtime.js";

export { IGNORE_DIRS, MAX_DEPTH, walkDirs, rulesFilesIn, ruleSearchDirs } from "./fs-scan.js";

export {
  discoverAgents,
  discoverSkills,
  discoverProjectRules,
  discoverRuleLibrary,
  discoverProjectTree,
  discoverVibeRules,
  hasVibeRules,
  parseVibeList,
  findUpBundledAgents,
  BUNDLED_AGENTS_REL,
  type DiscoveredDefinition,
  type ProjectRule,
  type RuleLibraryEntry,
  type TreeNode,
} from "./discovery.js";

// help-server's read-only surface, folded in by docs/plans/m6-help-server-merge.md. All four
// read the OPEN PROJECT plus `~/.claude` — there is no container mount and no precompute file to
// recover a path from, which is what the merge retired along with port 3008.
export { listInstalledPlugins, readProjectMarketplace, projectMarketplacePath } from "./plugins.js";
export { listCuratedPlugins, CURATED_MARKETPLACES } from "./curated.js";
export { readClaudeCommands, claudeCommandsDocPath } from "./commands.js";
export { listDocs, readDoc, docSections, docsDir, isValidDocSlug, slugifyHeading } from "./docs.js";

export { applyRules, targetDirFor, type ApplyRulesSummary } from "./rules.js";

export { listTasks, closeTask, tasksDirFor, parseBlockedBy, type MaestroTask, type TaskStatus } from "./tasks.js";

export {
  parseLogLines,
  readSessionLog,
  tailSessionLog,
  sessionLogFileFor,
  type SessionLogEntry,
  type SessionLogTailEvents,
} from "./session-log.js";

export { saveConfig, type SaveResult } from "./save.js";

export {
  installRuntime,
  installStatus,
  installOrchestratorSkill,
  runtimeAssets,
  findRepoRoot,
  findUpPluginRoot,
  defaultPluginRoot,
  HOOK_REGISTRATIONS,
  type InstallReport,
  type InstallStatus,
  type OrchestratorSkillAction,
  type RuntimeAsset,
  type HookRegistration,
  type HookEvent,
} from "./install.js";

export {
  uninstallRuntime,
  uninstallPlan,
  purgeTargets,
  type UninstallOptions,
  type UninstallPlan,
  type UninstallReport,
} from "./uninstall.js";

export { detectImplAgents, type RepoDetection } from "./detect.js";

export {
  listMarketplaces,
  marketplacePath,
  marketplaceOwner,
  marketplacePlugins,
  type MarketplaceEntry,
  type MarketplaceOptions,
} from "./marketplaces.js";

// The deterministic half of the create-* flows. `./text.js` is the renderer's half —
// the same `buildDesc`/`clip` the scaffold writes with, so a form's live preview and the file that
// lands cannot disagree.
export {
  scaffoldCreate,
  resolveCreateTarget,
  validateCreateRequest,
  type CreateRequest,
  type CreateTarget,
  type ScaffoldOptions,
  type ScaffoldResult,
} from "./scaffold.js";

// The git half of the create-marketplace scaffold. Deliberately NOT imported by `scaffold.ts`:
// it is handed in as a port, so the scaffold's import graph — which `claude-preview.ts` shares —
// stays free of `child_process`. See `GitPort` in `contracts.ts`.
export { nodeGit } from "./git.js";
export { enclosingRepo } from "./repo.js";

export { buildDesc, clip, deriveName, firstSentence, joinOxford, stripNamespace, titleFromName } from "./text.js";

// The `claude -p` bridge, in three modules on purpose: preview cannot spawn, run cannot invent.
// Import `claude-preview.js` directly if you want that guarantee at the import level — pulling
// preview off this barrel re-exports the spawn path alongside it.
export {
  previewClaudeRun,
  CLAUDE_BASE_FLAGS,
  type ClaudePreview,
  type ClaudeReadScope,
  type ClaudeRequest,
  type ClaudeWriteTarget,
  type PreviewOptions,
} from "./claude-preview.js";

// What a run can READ, derived from the effective settings rather than from the app's intent.
// Pure — the resolution itself arrives as a `SettingsPort`, from `agent-sdk.js` below.
export { buildReadScope, withinDirectory, RULE_DISPLAY_CAP, type ReadScopeInput } from "./read-scope.js";

export { resolveClaudeCli, claudeSearchDirs, cliNotFoundMessage, type ClaudeCli } from "./claude-cli.js";

export {
  runPreviewedClaude,
  cancelClaudeRun,
  disposeClaudeRuns,
  spawnClaudeChild,
  TokenRefused,
  type ClaudeRunDeps,
  type ClaudeRunEvents,
  type ClaudeOutputChunk,
  type ClaudeRunResult,
} from "./claude-run.js";

export { clearInvocations, TOKEN_TTL_MS, type ClaudeInvocation, type InvocationPurpose } from "./claude-tokens.js";

// The Claude Agent SDK — the steerable path to the same CLI, and the ground the session pane is
// built on. `runAgentSdkSmoke` proves a query runs in a PACKAGED build, which is the only place
// this slice's failure modes appear. `nodeSettings` is the first user-facing consumer: it resolves
// the settings cascade for the confirmation dialog's read disclosure, and is injected as a port
// rather than imported, so `claude-preview.ts` still cannot reach a process. See ./agent-sdk.ts.
export {
  runAgentSdkSmoke,
  writeSmokeReceipt,
  agentChildEnv,
  nodeSettings,
  resolveEffectiveSettings,
  billingFrom,
  startAgentSession,
  AGENT_SDK_PACKAGE,
  BILLING_ENV_VARS,
  SMOKE_PROMPT,
  SESSION_TOOLS,
  SESSION_DISALLOWED_TOOLS,
  type AgentBilling,
  type AgentChildEnv,
  type AgentDenial,
  type AgentSdkSmokeResult,
  type AgentSession,
  type AgentSessionRequest,
  type AgentSessionResult,
  type SmokeOptions,
} from "./agent-sdk.js";

// What a run may WRITE, decided per tool call. Pure — the counterpart to `read-scope.ts`, and the
// module that replaced `--permission-mode acceptEdits`.
export {
  decideWrite,
  targetPathOf,
  READ_ONLY_TOOLS,
  WRITE_TOOLS,
  type WriteDecision,
  type WriteScopeInput,
} from "./write-scope.js";

// Usage stats. The same preview-then-run shape and the same token store as the bridge above,
// because the thing being confirmed is the same kind of thing: a command about to run on the
// user's machine — and, when no local copy exists, one FETCHED FROM THE NETWORK first. The
// decision behind that, and why the version is pinned, is written at the top of ./ccusage.ts.
export {
  previewUsageStats,
  runUsageStats,
  resolveCcusage,
  ccusageArgv,
  ccusageNotFoundMessage,
  reduceUsage,
  emptyUsageStats,
  PINNED_CCUSAGE_VERSION,
  type CcusageCli,
  type CcusageSource,
  type UsageStats,
  type UsageStatsPreview,
  type UsageStatsResult,
  type UsageStatsView,
} from "./ccusage.js";

export { defaultV3Config, buildWorkflow, linearWorkflow, buildTestsWorkflow, type SkillMap } from "./seed.js";
