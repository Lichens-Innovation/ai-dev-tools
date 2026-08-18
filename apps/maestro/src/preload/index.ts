// The contextBridge. This is the only thing the renderer can reach node through.
//
// Note what is NOT exposed: no `invoke(channel, …)` escape hatch, no fs, no child_process. The
// renderer can call exactly the operations enumerated in ../shared/ipc.ts and nothing else.

import { contextBridge, ipcRenderer } from "electron";
import { IPC, IPC_EVENTS } from "../shared/ipc.js";
import type {
  ClaudeOutputChunk,
  MaestroApi,
  ProjectState,
  SaveInput,
  SessionLogEntry,
} from "../shared/ipc.js";

const api: MaestroApi = {
  project: {
    get: () => ipcRenderer.invoke(IPC.projectGet),
    pick: () => ipcRenderer.invoke(IPC.projectPick),
    open: (root) => ipcRenderer.invoke(IPC.projectOpen, root),
    forget: (root) => ipcRenderer.invoke(IPC.projectForget, root),
    onChanged: (cb) => {
      const listener = (_e: unknown, state: ProjectState) => cb(state);
      ipcRenderer.on(IPC_EVENTS.projectChanged, listener);
      return () => ipcRenderer.removeListener(IPC_EVENTS.projectChanged, listener);
    },
  },
  data: {
    workflows: () => ipcRenderer.invoke(IPC.workflowsData),
    reseed: (implAgents) => ipcRenderer.invoke(IPC.workflowsReseed, implAgents),
    rules: () => ipcRenderer.invoke(IPC.rulesData),
  },
  config: {
    save: (input: SaveInput) => ipcRenderer.invoke(IPC.configSave, input),
  },
  tasks: {
    list: () => ipcRenderer.invoke(IPC.tasksList),
    close: (filename) => ipcRenderer.invoke(IPC.tasksClose, filename),
  },
  install: {
    status: () => ipcRenderer.invoke(IPC.installStatus),
    run: () => ipcRenderer.invoke(IPC.installRun),
    uninstallPlan: () => ipcRenderer.invoke(IPC.installUninstallPlan),
    uninstall: (opts) => ipcRenderer.invoke(IPC.installUninstall, opts),
  },
  claude: {
    preview: (request) => ipcRenderer.invoke(IPC.claudePreview, request),
    // The token is the ONLY thing that crosses on a run — no prompt, no argv, no cwd. Whatever
    // this renderer believes it is running, what actually runs is the invocation main recorded
    // when it built the preview. Keep it that way: an extra argument here is the whole hole.
    run: (token, onOutput) => {
      // The token doubles as the run's id, so output can be routed before the invoke resolves —
      // there is no window in which a chunk arrives with nothing to attribute it to.
      const listener = (_e: unknown, payload: ClaudeOutputChunk & { token: string }) => {
        if (payload.token === token) onOutput({ stream: payload.stream, chunk: payload.chunk });
      };
      ipcRenderer.on(IPC_EVENTS.claudeOutput, listener);
      return ipcRenderer
        .invoke(IPC.claudeRun, token)
        .finally(() => ipcRenderer.removeListener(IPC_EVENTS.claudeOutput, listener));
    },
    cancel: (token) => ipcRenderer.invoke(IPC.claudeCancel, token),
  },
  log: {
    subscribe: (handlers) => {
      const onInit = (_e: unknown, entries: SessionLogEntry[]) => handlers.onInit(entries);
      const onEntry = (_e: unknown, entry: SessionLogEntry) => handlers.onEntry(entry);
      const onReset = () => handlers.onReset();

      ipcRenderer.on(IPC_EVENTS.logInit, onInit);
      ipcRenderer.on(IPC_EVENTS.logEntry, onEntry);
      ipcRenderer.on(IPC_EVENTS.logReset, onReset);
      void ipcRenderer.invoke(IPC.logSubscribe);

      return () => {
        ipcRenderer.removeListener(IPC_EVENTS.logInit, onInit);
        ipcRenderer.removeListener(IPC_EVENTS.logEntry, onEntry);
        ipcRenderer.removeListener(IPC_EVENTS.logReset, onReset);
        void ipcRenderer.invoke(IPC.logUnsubscribe);
      };
    },
  },
  shell: {
    reveal: (target) => ipcRenderer.invoke(IPC.revealInFolder, target),
  },
};

contextBridge.exposeInMainWorld("maestro", api);
