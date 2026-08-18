// The IPC contract, shared by main / preload / renderer.
//
// This file is the seam that replaces TanStack Start's server functions. Where the web app had
// `createServerFn().handler()` — a function whose body was stripped from the client bundle by a
// build step — the desktop app has an explicit typed channel. The boundary is now enforced by
// the process split rather than by a convention about which helpers may be exported, which is
// what retires the whole "Server-only code and the client bundle" hazard class.
//
// Type-only: no runtime imports, so the renderer can use these types without pulling node in.

// Imported from the `/contracts` subpath, NOT the package barrel. The barrel re-exports fs,
// child_process, and import.meta.dirname; pulling a type from it would drag all of that into
// the renderer's type graph. `/contracts` is interfaces only.
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
  ClaudeOutputChunk,
  ClaudeRunResult,
} from "@repo/maestro-core/contracts";

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
  ClaudeOutputChunk,
  ClaudeRunResult,
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
  configSave: "config:save",

  tasksList: "tasks:list",
  tasksClose: "tasks:close",

  installStatus: "install:status",
  installRun: "install:run",
  installUninstallPlan: "install:uninstall-plan",
  installUninstall: "install:uninstall",

  // Two channels, deliberately not one. `claude:preview` builds the prompt and cannot spawn;
  // `claude:run` spawns and cannot build. See MaestroApi.claude below.
  claudePreview: "claude:preview",
  claudeRun: "claude:run",
  claudeCancel: "claude:cancel",

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
  };
  config: {
    save(input: SaveInput): Promise<SaveResult>;
  };
  tasks: {
    list(): Promise<MaestroTask[]>;
    close(filename: string): Promise<MaestroTask[]>;
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
   * no child_process, and a test in `@repo/maestro-core` walks its import graph to keep it that way.
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
