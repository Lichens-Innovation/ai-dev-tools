// The IPC contract, shared by main / preload / renderer.
//
// This file is the seam that replaces TanStack Start's server functions. Where the web app had
// `createServerFn().handler()` — a function whose body was stripped from the client bundle by a
// build step — the desktop app has an explicit typed channel. The boundary is now enforced by
// the process split rather than by a convention about which helpers may be exported, which is
// what retires the whole "Server-only code and the client bundle" hazard class.
//
// Type-only: no runtime imports, so the renderer can use these types without pulling node in.

// Imported from `../core/contracts.js`, NOT `../core/index.js`. The barrel re-exports fs and
// child_process; pulling a type from it would drag all of that into the renderer's type graph.
// `contracts.ts` is interfaces only. One word apart in an import line, so test/isolation.test.ts
// asserts nothing under src/{shared,preload,renderer} reaches past the renderer-safe modules.
import type {
  MaestroConfigV3,
  MaestroInstanceV3,
  MaestroNodeV3,
  MaestroEdgeV3,
  MaestroWorkflowV3,
  MaestroRuleV3,
  MaestroWorkflowsSlice,
  MaestroRulesSlice,
  DiscoveredDefinition,
  ProjectRule,
  TreeNode,
  MaestroTask,
  SessionLogEntry,
  SaveResult,
  RepoDetection,
  InstallStatus,
  InstallReport,
  UninstallPlan,
  UninstallReport,
  ClaudeRequest,
  ClaudePreview,
  ClaudeWriteTarget,
  ClaudeReadScope,
  ClaudeReadDirectory,
  ClaudePermissionRule,
  ReadScopeOrigin,
  SettingsTier,
  SettingsPermissions,
  SettingsSourceInfo,
  ClaudeOutputChunk,
  ClaudeRunResult,
  ChatTurn,
  CreateOptions,
  CreateRequest,
  MarketplaceEntry,
  ScaffoldResult,
  InstalledPluginInfo,
  MarketplacePluginInfo,
  DefinitionSummary,
  CuratedPlugin,
  RuleLibraryEntry,
  ClaudeCommand,
  DocMeta,
  DocSection,
  DocContent,
  CcusageSource,
  UsageStats,
  UsageStatsPreview,
  UsageStatsResult,
  UsageStatsView,
  UsageTotals,
} from "../core/contracts.js";

export type {
  MaestroConfigV3,
  MaestroInstanceV3,
  MaestroNodeV3,
  MaestroEdgeV3,
  MaestroWorkflowV3,
  MaestroRuleV3,
  MaestroWorkflowsSlice,
  MaestroRulesSlice,
  DiscoveredDefinition,
  ProjectRule,
  TreeNode,
  MaestroTask,
  SessionLogEntry,
  SaveResult,
  RepoDetection,
  InstallStatus,
  InstallReport,
  UninstallPlan,
  UninstallReport,
  ClaudeRequest,
  ClaudePreview,
  ClaudeWriteTarget,
  ClaudeReadScope,
  ClaudeReadDirectory,
  ClaudePermissionRule,
  ReadScopeOrigin,
  SettingsTier,
  SettingsPermissions,
  SettingsSourceInfo,
  ClaudeOutputChunk,
  ClaudeRunResult,
  ChatTurn,
  CreateOptions,
  CreateRequest,
  MarketplaceEntry,
  ScaffoldResult,
  InstalledPluginInfo,
  MarketplacePluginInfo,
  DefinitionSummary,
  CuratedPlugin,
  RuleLibraryEntry,
  ClaudeCommand,
  DocMeta,
  DocSection,
  DocContent,
  CcusageSource,
  UsageStats,
  UsageStatsPreview,
  UsageStatsResult,
  UsageStatsView,
  UsageTotals,
};

/** A project the app has opened, as remembered in the recent-projects list. */
export interface ProjectRef {
  root: string;
  name: string;
  lastOpened: string;
}

export interface ProjectState {
  /** null before the user has picked a project. */
  current: ProjectRef | null;
  recent: ProjectRef[];
}

/** Everything the /workflows route needs to render, in one round trip. */
export interface WorkflowsData {
  projectRoot: string;
  config: MaestroConfigV3;
  /**
   * True when the project has no maestro.json and `config` is the starter seed rather than
   * anything on disk. The canvas opens populated, but nothing is persisted until the user saves.
   */
  seeded: boolean;
  /**
   * How the starter chain was chosen, and why — null once the project has a `maestro.json`, since
   * the config on disk is the user's answer and re-deriving one would be noise.
   *
   * Carried on the same payload as the seed rather than fetched from its own channel: the evidence
   * has to describe the chain the canvas is actually showing, and two round trips could disagree.
   */
  detection: RepoDetection | null;
  agents: DiscoveredDefinition[];
  skills: DiscoveredDefinition[];
}

/** Everything the /rules route needs. */
export interface RulesData {
  projectRoot: string;
  config: MaestroConfigV3;
  seeded: boolean;
  tree: TreeNode[];
  projectRules: ProjectRule[];
  vibeRules: string[];
  /** False when the vibe-rules CLI isn't on PATH — the UI says so instead of listing nothing. */
  vibeRulesAvailable: boolean;
}

/**
 * Everything the /tools dashboard needs, in one round trip.
 *
 * ONE channel for four tabs, not four channels. help-server fetched each of these from its own
 * `createServerFn` and paid for it twice over: `getProjectMarketplace` and `getCuratedPlugins`
 * each re-read `installed_plugins.json` to decide their own `isInstalled` flags. The same lesson
 * as /rules in M2 — a view's tabs are one view, and a payload assembled in one pass cannot have
 * two tabs disagreeing about what is installed.
 */
export interface ToolsData {
  /** "" when no project is open; the route says so rather than rendering four empty tables. */
  projectRoot: string;
  installedPlugins: InstalledPluginInfo[];
  projectMarketplace: MarketplacePluginInfo[];
  curated: CuratedPlugin[];
  ruleLibrary: RuleLibraryEntry[];
  commands: ClaudeCommand[];
}

/** The doc list and the search corpus — both of which every docs view needs at once. */
export interface DocsData {
  projectRoot: string;
  docs: DocMeta[];
  /**
   * Every doc split at its headings. Carried alongside the list rather than fetched when the user
   * starts typing: search has to answer on the first keystroke, and the corpus is the same bytes
   * the list was built from, so a second read could only introduce a disagreement.
   */
  sections: DocSection[];
}

export type SaveInput =
  | { sliceType: "workflows"; slice: MaestroWorkflowsSlice }
  | { sliceType: "rules"; slice: MaestroRulesSlice };

export const IPC = {
  projectGet: "project:get",
  projectPick: "project:pick",
  projectOpen: "project:open",
  projectForget: "project:forget",

  workflowsData: "data:workflows",
  workflowsReseed: "data:reseed",
  rulesData: "data:rules",
  toolsData: "data:tools",
  docsData: "data:docs",
  docContent: "data:doc",
  configSave: "config:save",

  tasksList: "tasks:list",
  tasksClose: "tasks:close",

  createOptions: "create:options",
  createScaffold: "create:scaffold",

  installStatus: "install:status",
  installRun: "install:run",
  installUninstallPlan: "install:uninstall-plan",
  installUninstall: "install:uninstall",

  // Two channels, deliberately not one. `claude:preview` builds the prompt and cannot spawn;
  // `claude:run` spawns and cannot build. See MaestroApi.claude below.
  claudePreview: "claude:preview",
  claudeRun: "claude:run",
  claudeCancel: "claude:cancel",

  // Usage stats, in the same two halves and for the same reason: with no local `ccusage`, running
  // one means fetching a package from npm and executing it, so what would run is returned before
  // anything does. See src/core/ccusage.ts.
  statsPreview: "stats:preview",
  statsRun: "stats:run",

  logSubscribe: "log:subscribe",
  logUnsubscribe: "log:unsubscribe",

  revealInFolder: "shell:reveal",
} as const;

/** Push channels: main → renderer. */
export const IPC_EVENTS = {
  claudeOutput: "claude:output",
  logInit: "log:init",
  logEntry: "log:entry",
  logReset: "log:reset",
  projectChanged: "project:changed",
} as const;

/** The surface exposed on `window.maestro` by the preload script. */
export interface MaestroApi {
  project: {
    get(): Promise<ProjectState>;
    /** Opens a native directory picker. Resolves null if the user cancels. */
    pick(): Promise<ProjectState | null>;
    open(root: string): Promise<ProjectState>;
    forget(root: string): Promise<ProjectState>;
    onChanged(cb: (state: ProjectState) => void): () => void;
  };
  data: {
    workflows(): Promise<WorkflowsData>;
    /**
     * Rebuild the starter config around a different implementation-agent chain — what the user
     * corrected the detection to. Pure: it writes nothing, so the canvas can be re-seeded as often
     * as the user changes their mind, and the project stays unconfigured until they press Save.
     */
    reseed(implAgents: string[]): Promise<MaestroConfigV3>;
    rules(): Promise<RulesData>;
    /** The /tools dashboard's four tabs. Never rejects: an absent file is an empty section. */
    tools(): Promise<ToolsData>;
    /** The doc list plus the search corpus. Never rejects; a project with no docs/ returns []. */
    docs(): Promise<DocsData>;
    /**
     * One doc's body. REJECTS — on a bad slug, a missing file, or an unreadable one — because a
     * reader that renders a blank page for all three tells the user nothing. Call it through
     * `callMain` and show the reason.
     */
    doc(slug: string): Promise<DocContent>;
  };
  config: {
    save(input: SaveInput): Promise<SaveResult>;
  };
  tasks: {
    list(): Promise<MaestroTask[]>;
    close(filename: string): Promise<MaestroTask[]>;
  };
  /**
   * The four create-* forms. Two operations, mirroring the bridge's own split for the same reason:
   * one of them writes, and it is not the one that can reach a model.
   *
   * `scaffold` does everything deterministic — the directory, the frontmatter, the manifest, the
   * marketplace registration — and returns what it wrote. No model is involved and none can be:
   * the module behind it calls nothing. The artifact exists the moment the user presses Create.
   *
   * Whatever is left (a skill's prose, an agent's system prompt) is a `ClaudeRequest` like any
   * other, so it goes out through `claude.preview` and the confirmation dialog. These routes have
   * no spawn path of their own; that is the point, since a route that shelled out directly would
   * have opted out of the preview the user is owed.
   */
  create: {
    /** The marketplaces and plugins the selectors offer, read from ~/.claude at call time. */
    options(): Promise<CreateOptions>;
    /**
     * Write the deterministic part. Rejects on an invalid request and on a failed write — and a
     * failed write leaves the disk as it found it, so the caller reports a reason rather than
     * discovering a half-made artifact later.
     */
    scaffold(request: CreateRequest): Promise<ScaffoldResult>;
  };
  install: {
    status(): Promise<InstallStatus>;
    /**
     * Install or update Maestro's runtime in the open project. Idempotent, and rejects (rather
     * than half-writing) when it cannot proceed — so the caller must go through `callMain`.
     */
    run(): Promise<InstallReport>;
    /**
     * What each level of an uninstall would remove, right now. Reads only — this is what fills
     * the purge confirmation, so it can name the files before anything is deleted.
     */
    uninstallPlan(): Promise<UninstallPlan>;
    /**
     * Remove the runtime. `purge` is the destructive level: it also deletes the orchestrator
     * skill, the copied scripts and `maestro.json`. It defaults to false ON THE MAIN SIDE too —
     * the renderer has to ask for it explicitly, so no call can turn into a purge by accident.
     */
    uninstall(opts?: { purge?: boolean }): Promise<UninstallReport>;
  };
  /**
   * The `claude -p` bridge. Two operations, and the split is the security design.
   *
   * `preview` builds the prompt from a REQUEST — never from prompt text the renderer supplies —
   * and hands back the exact argv, the working directory, what may be written, whether the CLI
   * was found, and a single-use token. It cannot spawn: the main-process module behind it imports
   * no child_process, and `test/core/claude.test.ts` walks its import graph to keep it that way.
   *
   * `run` takes that token and NOTHING ELSE, so there is no argument by which a caller could make
   * the run differ from the preview the user confirmed. The property this buys is that the only
   * executable prompts are ones the user was shown; a renderer bug cannot invent one and run it.
   * Collapsing these into a single "run this prompt" call looks like a simplification and is the
   * removal of that guarantee.
   */
  claude: {
    preview(request: ClaudeRequest): Promise<ClaudePreview>;
    /**
     * Start the previewed run. `onOutput` fires as output arrives — these runs are minutes long,
     * so the UI must never wait for the resolve to show anything. Resolves with how it ended;
     * rejects only when the token is refused (forged, replayed, or expired).
     */
    run(token: string, onOutput: (chunk: ClaudeOutputChunk) => void): Promise<ClaudeRunResult>;
    /** Stop a run. Signals the child's whole process group, so the CLI's own children go too. */
    cancel(token: string): Promise<void>;
  };
  /**
   * Usage stats, behind the same preview-then-run split as the bridge.
   *
   * The split is not ceremony copied from above: with no local `ccusage`, answering "what have I
   * spent?" downloads a package from npm and executes it on this machine. `preview` says so —
   * `network: true`, plus the exact argv and the PINNED version — and spawns nothing. `run` takes
   * the token that preview issued and nothing else, so the command that executes is the one that
   * was on screen. help-server did neither: `npx ccusage@latest` on every view, unannounced.
   */
  stats: {
    /** What would run, and whether it touches the network. Never rejects. */
    preview(view: UsageStatsView): Promise<UsageStatsPreview>;
    /**
     * Run the previewed command and reduce its output. Rejects only when the token is refused
     * (forged, replayed, expired, or issued for a Claude run rather than this one); a ccusage that
     * fails or answers in an unrecognised shape resolves with `ok: false` and a reason.
     */
    run(token: string, view: UsageStatsView): Promise<UsageStatsResult>;
  };
  log: {
    /**
     * Start the tail and receive pushes. Returns an unsubscribe function.
     * Replaces the SSE route + EventSource the web app used.
     *
     * SINGLE-OWNER. The main process keys one tail per `webContents.id` and stops any existing
     * tail before starting a new one, so a second subscriber in the same window silently steals
     * the tail from the first, and whichever unsubscribes first kills it for both. The one owner
     * is `SessionLogProvider`, mounted once in `__root.tsx`; read from it via `useSessionLog()`
     * rather than subscribing again. A test asserts there is exactly one call site.
     */
    subscribe(handlers: {
      onInit(entries: SessionLogEntry[]): void;
      onEntry(entry: SessionLogEntry): void;
      onReset(): void;
    }): () => void;
  };
  shell: {
    reveal(target: string): Promise<void>;
  };
}
