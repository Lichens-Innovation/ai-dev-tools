// @repo/maestro-core — all node-side Maestro logic, framework-free.
//
// Consumed by the Maestro desktop app's main process (over IPC) and, for the two pure modules,
// re-bundled to CJS for the plugin's standalone Claude Code hook scripts. Nothing here imports
// React, TanStack, or Electron.

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

export {
  orchestratorSkillPath,
  successPath,
  handoffTable,
  renderOrchestrator,
  type RenderResult,
} from "./render.js";

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
  discoverProjectTree,
  discoverVibeRules,
  hasVibeRules,
  parseVibeList,
  defaultBundledAgentsDir,
  type DiscoveredDefinition,
  type ProjectRule,
  type TreeNode,
} from "./discovery.js";

export { applyRules, targetDirFor, type ApplyRulesSummary } from "./rules.js";

export {
  listTasks,
  closeTask,
  tasksDirFor,
  parseBlockedBy,
  type MaestroTask,
  type TaskStatus,
} from "./tasks.js";

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

// The deterministic half of the create-* flows. `@repo/maestro-core/text` is the renderer's half —
// the same `buildDesc`/`clip` the scaffold writes with, so a form's live preview and the file that
// lands cannot disagree.
export {
  scaffoldCreate,
  resolveCreateTarget,
  validateCreateRequest,
  type CreateRequest,
  type CreateTarget,
  type ScaffoldResult,
} from "./scaffold.js";

export {
  buildDesc,
  clip,
  deriveName,
  firstSentence,
  joinOxford,
  stripNamespace,
  titleFromName,
} from "./text.js";

// The `claude -p` bridge, in three modules on purpose: preview cannot spawn, run cannot invent.
// Import `claude-preview.js` directly if you want that guarantee at the import level — pulling
// preview off this barrel re-exports the spawn path alongside it.
export {
  previewClaudeRun,
  CLAUDE_BASE_FLAGS,
  type ClaudePreview,
  type ClaudeRequest,
  type ClaudeWriteTarget,
} from "./claude-preview.js";

export { resolveClaudeCli, claudeSearchDirs, cliNotFoundMessage, type ClaudeCli } from "./claude-cli.js";

export {
  runPreviewedClaude,
  cancelClaudeRun,
  disposeClaudeRuns,
  TokenRefused,
  type ClaudeRunEvents,
  type ClaudeOutputChunk,
  type ClaudeRunResult,
} from "./claude-run.js";

export { clearInvocations, TOKEN_TTL_MS, type ClaudeInvocation } from "./claude-tokens.js";

export {
  defaultV3Config,
  buildWorkflow,
  linearWorkflow,
  buildTestsWorkflow,
  type SkillMap,
} from "./seed.js";
