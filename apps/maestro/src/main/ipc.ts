// IPC handlers — the whole node-side surface of the app.
//
// Every handler is a thin adapter over @repo/maestro-core. Deliberately so: the logic is tested
// in that package without an Electron runtime, and this file stays readable as a list of what
// the renderer is allowed to ask for.

import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import {
  readConfig,
  blankConfig,
  defaultV3Config,
  saveConfig,
  discoverAgents,
  discoverSkills,
  discoverProjectRules,
  discoverProjectTree,
  discoverVibeRules,
  hasVibeRules,
  listTasks,
  closeTask,
  tailSessionLog,
  orchestratorSkillPath,
  maestroJsonPath,
} from "@repo/maestro-core";
import { IPC, IPC_EVENTS } from "../shared/ipc.js";
import type {
  InstallStatus,
  ProjectState,
  RulesData,
  SaveInput,
  WorkflowsData,
} from "../shared/ipc.js";
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
    }),
  );
}

function announce(state: ProjectState): ProjectState {
  broadcast(IPC_EVENTS.projectChanged, state);
  retargetTails();
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
      return { projectRoot: "", config: blankConfig(), seeded: false, agents: [], skills: [] };
    }
    const [agents, skills] = await Promise.all([discoverAgents(projectRoot), discoverSkills(projectRoot)]);
    const onDisk = readConfig(projectRoot);
    return {
      projectRoot,
      // First open of an unconfigured project: hand back the starter workflows so the canvas
      // isn't empty. M3 replaces the hardcoded impl chain with repo detection.
      config: onDisk ?? defaultV3Config(["backend"]),
      seeded: onDisk === null,
      agents,
      skills,
    };
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

  // ── install status ───────────────────────────────────────────────────
  ipcMain.handle(IPC.installStatus, (): InstallStatus => {
    const root = currentRoot();
    if (!root) return { orchestratorSkill: false, scriptsDir: false, configFile: false };
    return {
      orchestratorSkill: fs.existsSync(orchestratorSkillPath(root)),
      scriptsDir: fs.existsSync(path.join(root, ".claude", "scripts")),
      configFile: fs.existsSync(maestroJsonPath(root)),
    };
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
}
