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
  discoverProjectTree,
  discoverVibeRules,
  hasVibeRules,
  listTasks,
  closeTask,
  listMarketplaces,
  scaffoldCreate,
  tailSessionLog,
  installStatus,
  installRuntime,
  uninstallPlan,
  uninstallRuntime,
  previewClaudeRun,
  runPreviewedClaude,
  cancelClaudeRun,
  disposeClaudeRuns,
  clearInvocations,
} from "../core/index.js";
import { IPC, IPC_EVENTS } from "../shared/ipc.js";
import type {
  ClaudePreview,
  ClaudeRequest,
  CreateOptions,
  CreateRequest,
  ScaffoldResult,
  ClaudeRunResult,
  MaestroConfigV3,
  InstallReport,
  InstallStatus,
  UninstallPlan,
  UninstallReport,
  ProjectState,
  RulesData,
  SaveInput,
  WorkflowsData,
} from "../shared/ipc.js";
import { bundledAgentsDir } from "./bundled-assets.js";
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
  ipcMain.handle(IPC.createScaffold, (_e, request: CreateRequest): ScaffoldResult => {
    const result = scaffoldCreate(currentRoot() ?? "", request);
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
  ipcMain.handle(IPC.claudePreview, (_e, request: ClaudeRequest): ClaudePreview => {
    const root = currentRoot();
    if (!root) throw new Error("No project is open.");
    return previewClaudeRun(root, request);
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
}
