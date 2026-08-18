// IPC handlers — the whole node-side surface of the app.
//
// Every handler is a thin adapter over ../core. Deliberately so: the logic is tested under
// test/core/ without an Electron runtime, and this file stays readable as a list of what the
// renderer is allowed to ask for.

import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import {
  readConfig,
  blankConfig,
  defaultV3Config,
  detectImplAgents,
  saveConfig,
  discoverAgents,
  discoverSkills,
  discoverProjectRules,
  discoverRuleLibrary,
  discoverProjectTree,
  discoverVibeRules,
  hasVibeRules,
  listTasks,
  closeTask,
  listMarketplaces,
  scaffoldCreate,
  nodeGit,
  tailSessionLog,
  installStatus,
  installRuntime,
  uninstallPlan,
  uninstallRuntime,
  listInstalledPlugins,
  readProjectMarketplace,
  listCuratedPlugins,
  readClaudeCommands,
  listDocs,
  readDoc,
  docSections,
  previewClaudeRun,
  nodeSettings,
  runPreviewedClaude,
  cancelClaudeRun,
  disposeClaudeRuns,
  clearInvocations,
  previewUsageStats,
  runUsageStats,
} from "../core/index.js";
import { IPC, IPC_EVENTS } from "../shared/ipc.js";
import type {
  PermissionChoice,
  SessionInfo,
  ClaudePreview,
  ClaudeRequest,
  CreateOptions,
  CreateRequest,
  DocContent,
  DocsData,
  ScaffoldResult,
  ClaudeRunResult,
  MaestroConfigV3,
  ToolsData,
  InstallReport,
  InstallStatus,
  UninstallPlan,
  UninstallReport,
  ProjectState,
  RulesData,
  SaveInput,
  UsageStatsPreview,
  UsageStatsResult,
  UsageStatsView,
  WorkflowsData,
} from "../shared/ipc.js";
import { bundledAgentsDir } from "./bundled-assets.js";
import {
  answerPermission,
  disposeSessions,
  endAllSessions,
  endSession,
  revokeGrant,
  saySession,
  sessionInfo,
  startSession,
  stopSession,
} from "./claude-session.js";
import { currentRoot, forgetProject, getState, openProject } from "./project-store.js";

/**
 * Active log tails, keyed by the webContents id that asked for one.
 *
 * One tail per window, not per subscriber: `startTail` stops any existing tail for the id first.
 * That makes `log.subscribe` single-owner — a second subscriber in the same renderer would steal
 * the tail, and the first unsubscribe would stop it for both. `SessionLogProvider` is that owner
 * (mounted once in `__root.tsx`) and a test in test/isolation.test.ts holds it to one call site.
 * Refcounting would be the alternative; with a single owner it would be unexercised code.
 */
const tails = new Map<number, () => void>();

function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

function stopTail(webContentsId: number): void {
  tails.get(webContentsId)?.();
  tails.delete(webContentsId);
}

/**
 * Restart every open tail against the current project. Called on a project switch — without it a
 * window would keep streaming the previously-opened repo's session log.
 */
function retargetTails(): void {
  for (const id of [...tails.keys()]) {
    stopTail(id);
    const wc = BrowserWindow.getAllWindows().find((w) => w.webContents.id === id)?.webContents;
    if (wc) startTail(wc.id);
  }
}

function startTail(webContentsId: number): void {
  const root = currentRoot();
  const wc = BrowserWindow.getAllWindows().find((w) => w.webContents.id === webContentsId)?.webContents;
  if (!wc) return;
  if (!root) {
    wc.send(IPC_EVENTS.logInit, []);
    return;
  }
  stopTail(webContentsId);
  tails.set(
    webContentsId,
    tailSessionLog(root, {
      init: (entries) => !wc.isDestroyed() && wc.send(IPC_EVENTS.logInit, entries),
      entry: (entry) => !wc.isDestroyed() && wc.send(IPC_EVENTS.logEntry, entry),
      reset: () => !wc.isDestroyed() && wc.send(IPC_EVENTS.logReset),
    })
  );
}

function announce(state: ProjectState): ProjectState {
  broadcast(IPC_EVENTS.projectChanged, state);
  retargetTails();
  // Outstanding previews name the OUTGOING project's working directory. A modal left open across
  // a project switch would otherwise still hold a runnable token, and pressing Run would spawn
  // Claude against the repo the window is no longer showing — the same class of bug the workflow
  // store's projectRoot key exists for. Runs already in flight keep their own cwd and are left alone.
  clearInvocations();
  // A live session ENDS on a switch, and nothing is started against the new project. Not a
  // retarget, unlike the tails above: a tail has no state to lose and a conversation does, so
  // silently re-pointing a transcript about repository A at repository B would be worse than
  // losing it — and starting one implicitly would spend the user's subscription on a project they
  // have only just opened. Same failure class as `seedWorkflowStore`'s keying; both prior
  // instances of it were silent.
  endAllSessions();
  return state;
}

export function registerIpc(): void {
  // ── project ──────────────────────────────────────────────────────────
  ipcMain.handle(IPC.projectGet, (): ProjectState => getState());

  ipcMain.handle(IPC.projectPick, async (): Promise<ProjectState | null> => {
    const res = await dialog.showOpenDialog({
      title: "Open project",
      properties: ["openDirectory", "createDirectory"],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return announce(openProject(res.filePaths[0]));
  });

  ipcMain.handle(IPC.projectOpen, (_e, root: string): ProjectState => announce(openProject(root)));
  ipcMain.handle(IPC.projectForget, (_e, root: string): ProjectState => announce(forgetProject(root)));

  // ── loaders ──────────────────────────────────────────────────────────
  ipcMain.handle(IPC.workflowsData, async (): Promise<WorkflowsData> => {
    const projectRoot = currentRoot();
    if (!projectRoot) {
      return { projectRoot: "", config: blankConfig(), seeded: false, detection: null, agents: [], skills: [] };
    }
    const [agents, skills] = await Promise.all([
      discoverAgents(projectRoot, bundledAgentsDir()),
      discoverSkills(projectRoot),
    ]);
    const onDisk = readConfig(projectRoot);
    if (onDisk) return { projectRoot, config: onDisk, seeded: false, detection: null, agents, skills };

    // First open of an unconfigured project: hand back the starter workflows so the canvas isn't
    // empty — with the implementation chain READ OFF THE REPO rather than hardcoded to
    // ["backend"], which gave a frontend project a backend agent and made the first thing the
    // user saw wrong about their own codebase. The detection travels with the seed so the UI can
    // show what it matched and let the user correct the chain before anything is written.
    const detection = detectImplAgents(projectRoot);
    return {
      projectRoot,
      config: defaultV3Config(detection.implAgents),
      seeded: true,
      detection,
      agents,
      skills,
    };
  });

  // The user amending the detection. Pure — nothing is written, so the chain can be corrected as
  // many times as it takes and the project stays unconfigured until Save.
  ipcMain.handle(IPC.workflowsReseed, (_e, implAgents: string[]): MaestroConfigV3 => {
    const clean = (Array.isArray(implAgents) ? implAgents : []).map((a) => String(a).trim()).filter(Boolean);
    return defaultV3Config(clean);
  });

  ipcMain.handle(IPC.rulesData, async (): Promise<RulesData> => {
    const projectRoot = currentRoot();
    if (!projectRoot) {
      return {
        projectRoot: "",
        config: blankConfig(),
        seeded: false,
        tree: [],
        projectRules: [],
        vibeRules: [],
        vibeRulesAvailable: false,
      };
    }
    const [vibeRules, vibeRulesAvailable] = await Promise.all([discoverVibeRules(), hasVibeRules()]);
    const onDisk = readConfig(projectRoot);
    return {
      projectRoot,
      config: onDisk ?? blankConfig(),
      seeded: onDisk === null,
      tree: discoverProjectTree(projectRoot),
      projectRules: discoverProjectRules(projectRoot),
      vibeRules,
      vibeRulesAvailable,
    };
  });

  // ── the read-only surface folded in from help-server ──────────────────
  // Two loaders, four tabs and two doc views. help-server ran six server functions for the same
  // screens, two of which each re-read `installed_plugins.json` to compute their own `isInstalled`
  // column; here the machine is read once per view and the tabs cannot disagree.
  //
  // Neither of these rejects. Every part is optional in a real project — no `.claude-plugin/`, no
  // `rules/`, no `docs/` — so an absent directory is an empty section, and the route says which
  // parts are empty. `data:doc` below is the exception, and deliberately so.
  ipcMain.handle(IPC.toolsData, async (): Promise<ToolsData> => {
    const projectRoot = currentRoot() ?? "";
    const [installedPlugins, projectMarketplace, curated] = await Promise.all([
      listInstalledPlugins(),
      readProjectMarketplace(projectRoot),
      listCuratedPlugins(),
    ]);
    return {
      projectRoot,
      installedPlugins,
      projectMarketplace,
      curated,
      ruleLibrary: discoverRuleLibrary(projectRoot),
      commands: readClaudeCommands(projectRoot),
    };
  });

  ipcMain.handle(IPC.docsData, (): DocsData => {
    const projectRoot = currentRoot() ?? "";
    return { projectRoot, docs: listDocs(projectRoot), sections: docSections(projectRoot) };
  });

  // Throws on an invalid slug, a missing file and an unreadable one — three states a reader that
  // returned "" would render identically, as an empty page with no explanation. `readDoc` also
  // refuses any slug carrying a separator or a dot, so the only file this can open is one directly
  // inside the open project's `docs/`.
  ipcMain.handle(IPC.docContent, (_e, slug: string): DocContent => {
    const root = currentRoot();
    if (!root) throw new Error("No project is open.");
    return readDoc(root, slug);
  });

  // ── save ─────────────────────────────────────────────────────────────
  // The milestone in one handler: write maestro.json, re-render the orchestrator, apply the rule
  // placements. No Claude session, no result file, no container.
  ipcMain.handle(IPC.configSave, async (_e, input: SaveInput) => {
    const projectRoot = currentRoot();
    if (!projectRoot) throw new Error("No project is open.");
    return saveConfig(projectRoot, input);
  });

  // ── tasks ────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.tasksList, () => listTasks(currentRoot()));
  ipcMain.handle(IPC.tasksClose, (_e, filename: string) => closeTask(currentRoot(), filename));

  // ── create-* ─────────────────────────────────────────────────────────
  // The deterministic half of the four create forms. `create:scaffold` is the ONLY channel in the
  // app that writes an artifact from a form, and it cannot reach a model — `scaffoldCreate` is a
  // pure function of the request plus the filesystem. Whatever it leaves unfinished goes back out
  // through `claude:preview` below, so the model half is confirmed like every other one.
  //
  // Note what does not cross this wire: a destination path. The renderer sends a marketplace NAME
  // it picked out of `create:options`, and `target: "project"` means the project THIS process has
  // open — so main resolves every path it writes to. The one exception is create-marketplace's
  // target directory, which is the whole point of that form and is validated as absolute and shown
  // in the scaffold's report.
  ipcMain.handle(
    IPC.createOptions,
    (): CreateOptions => ({
      marketplaces: listMarketplaces(),
      projectRoot: currentRoot() ?? "",
    })
  );

  // Throws on an invalid request or a failed write, so the caller must go through `callMain` —
  // "the write failed and here is why" has to reach the user, not an unhandled rejection.
  //
  // `nodeGit()` is the composition root for the one create step that is not `fs`: a new marketplace
  // is initialised as a repository and committed here, rather than by asking a model to run `git`.
  // The scaffold takes it as a port so its import graph stays spawn-free (see `GitPort`), which
  // means THIS line is what makes a new marketplace a repository — `test/isolation.test.ts` pins it.
  ipcMain.handle(IPC.createScaffold, (_e, request: CreateRequest): ScaffoldResult => {
    const result = scaffoldCreate(currentRoot() ?? "", request, { git: nodeGit() });
    if (!result.scaffolded) throw new Error(result.reason ?? "Nothing was written.");
    return result;
  });

  // ── install ──────────────────────────────────────────────────────────
  // The other half of the milestone: a project's Maestro runtime — the orchestrator skill, the
  // hook scripts, and the hook registrations in the project's OWN .claude/settings.json — is
  // installed and updated from here rather than by /maestro-install in a Claude session.
  ipcMain.handle(IPC.installStatus, async (): Promise<InstallStatus> => {
    const root = currentRoot();
    if (!root) throw new Error("No project is open.");
    return installStatus(root);
  });

  ipcMain.handle(IPC.installRun, async (): Promise<InstallReport> => {
    const root = currentRoot();
    if (!root) throw new Error("No project is open.");
    return installRuntime(root);
  });

  ipcMain.handle(IPC.installUninstallPlan, (): UninstallPlan => {
    const root = currentRoot();
    if (!root) throw new Error("No project is open.");
    return uninstallPlan(root);
  });

  // Two levels, and the destructive one is opt-in on this side of the boundary as well: `purge`
  // comes off the payload with an explicit `=== true`, so a malformed or absent argument can only
  // ever produce the level that keeps maestro.json.
  ipcMain.handle(IPC.installUninstall, async (_e, opts?: { purge?: boolean }): Promise<UninstallReport> => {
    const root = currentRoot();
    if (!root) throw new Error("No project is open.");
    return uninstallRuntime(root, { purge: opts?.purge === true });
  });

  // ── the claude -p bridge ─────────────────────────────────────────────
  // Two handlers, and which one can spawn is the point. `previewClaudeRun` comes from a module
  // that imports no child_process (asserted by test/core/claude.test.ts), so the channel the
  // renderer calls to BUILD a prompt has no path to a process. `runPreviewedClaude` takes the
  // token that preview issued and nothing else — there is no argument on this channel by which a
  // renderer could describe a different run, which is why "the only executable prompts are ones
  // the user was shown" is a property of the wiring rather than of the UI behaving itself.
  //
  // `nodeSettings()` is the second capability this file supplies, alongside `nodeGit()` above and
  // for the same structural reason: resolving the settings cascade lives in the Agent SDK, which
  // can start processes, and `claude-preview.ts` may import nothing that can. Injected here, the
  // preview reports what a run will ACTUALLY be able to read — including directories and permission
  // rules contributed by settings files the app never chose — instead of echoing its own arguments.
  // Drop this argument and the disclosure does not break: it correctly starts saying the settings
  // were not consulted, which is a quieter regression than a missing repository, so
  // `test/isolation.test.ts` pins this line too.
  ipcMain.handle(IPC.claudePreview, async (_e, request: ClaudeRequest): Promise<ClaudePreview> => {
    const root = currentRoot();
    if (!root) throw new Error("No project is open.");
    return previewClaudeRun(root, request, { settings: nodeSettings() });
  });

  ipcMain.handle(
    IPC.claudeRun,
    async (e, token: string): Promise<ClaudeRunResult> =>
      runPreviewedClaude(token, {
        // Chunk by chunk, as it arrives. The token identifies the run on both sides, so the renderer
        // can route output from the first byte without waiting for this handler to resolve.
        output: (chunk) => {
          if (!e.sender.isDestroyed()) e.sender.send(IPC_EVENTS.claudeOutput, { token, ...chunk });
        },
      })
  );

  ipcMain.handle(IPC.claudeCancel, (_e, token: string): void => {
    cancelClaudeRun(token);
  });

  // ── the session pane ─────────────────────────────────────────────────
  // The app's second way to reach a model, and the difference from the bridge above is who wrote
  // the prompt. There is no preview channel here and no token, because there is nothing for main
  // to have authored: `session:say` forwards TEXT THE USER TYPED and the SDK is told so
  // (`origin: { kind: "human" }`). What the session may do is decided entirely in main — the cwd
  // comes from the open project, the readable directories from `known_marketplaces.json`, and the
  // write scope is empty with no channel by which it could become anything else.
  //
  // One session per window, ended on a project switch (see `announce`) and reaped on quit.
  ipcMain.handle(IPC.sessionStart, async (e): Promise<SessionInfo> => {
    // The window going away is the case that leaves a detached `claude` running against the user's
    // repo with nothing left to stop it from — a reload counts, and there is no prompt timeout to
    // rescue it.
    e.sender.once("destroyed", () => endSession(e.sender.id));
    return startSession(e.sender.id, currentRoot() ?? "");
  });

  ipcMain.handle(IPC.sessionInfo, async (e): Promise<SessionInfo> => sessionInfo(e.sender.id, currentRoot() ?? ""));

  ipcMain.handle(IPC.sessionSay, (e, id: string, text: string): boolean => saySession(e.sender.id, id, text));

  ipcMain.handle(IPC.sessionStop, async (e, id: string): Promise<boolean> => stopSession(e.sender.id, id));

  // A parked permission request, answered. The renderer sends a CHOICE — allow, deny, stop, or a
  // grant's scope word, plus the reason the model is told — and `answerPermission` builds the
  // SDK-shaped result from it, so no permission RULE, mode or destination can be authored on this
  // side of the wire. A grant's one permitted update is `addDirectories` with
  // `destination: "session"`, which never reaches disk.
  ipcMain.handle(
    IPC.sessionPermission,
    async (e, id: string, requestId: string, choice: PermissionChoice): Promise<boolean> =>
      answerPermission(e.sender.id, id, requestId, choice)
  );

  // A grant taken back. It removes an entry main is already holding and can only ever NARROW what
  // the session may read — which is why a path is allowed to cross here while granting sends a
  // scope word and lets main resolve the path from the prompt it asked.
  ipcMain.handle(
    IPC.sessionRevoke,
    async (e, id: string, target: string): Promise<boolean> => revokeGrant(e.sender.id, id, target)
  );

  ipcMain.handle(IPC.sessionEnd, (e): void => endSession(e.sender.id));

  // ── usage stats ──────────────────────────────────────────────────────
  // The same two-handler shape, and for a reason of its own: with no `ccusage` installed locally,
  // answering this question DOWNLOADS A PACKAGE FROM NPM AND EXECUTES IT. help-server did that on
  // every view of its Stats tab, silently, on `@latest`. Here `stats:preview` reads the machine
  // and reports what would run — including `network: true` and the pinned version — without
  // spawning, and `stats:run` accepts only the token it issued. src/core/ccusage.ts has the
  // decision in full.
  //
  // Never rejects: a machine with neither ccusage nor npx is a normal machine, and the tab says so
  // rather than handing the renderer an error boundary.
  ipcMain.handle(
    IPC.statsPreview,
    (_e, view: UsageStatsView): UsageStatsPreview => previewUsageStats(currentRoot() ?? "", view)
  );

  ipcMain.handle(
    IPC.statsRun,
    async (_e, token: string, view: UsageStatsView): Promise<UsageStatsResult> => runUsageStats(token, view)
  );

  // ── session log ──────────────────────────────────────────────────────
  // No separate snapshot channel: `subscribe` emits the full snapshot as its first `init`, so a
  // second way to ask for the same bytes is surface with no consumer.
  ipcMain.handle(IPC.logSubscribe, (e) => {
    startTail(e.sender.id);
    e.sender.once("destroyed", () => stopTail(e.sender.id));
  });

  ipcMain.handle(IPC.logUnsubscribe, (e) => stopTail(e.sender.id));

  // ── shell ────────────────────────────────────────────────────────────
  ipcMain.handle(IPC.revealInFolder, (_e, target: string) => {
    if (target) shell.showItemInFolder(target);
  });
}

export function disposeIpc(): void {
  for (const id of [...tails.keys()]) stopTail(id);
  // A cancelled run's child is spawned detached, so it outlives us by design unless it is killed.
  // Without this, quitting the app leaves Claude running against the user's repo with no window
  // left to stop it from.
  disposeClaudeRuns();
  // And the pane's sessions, which are detached for the same reason and outlive us the same way.
  disposeSessions();
}
