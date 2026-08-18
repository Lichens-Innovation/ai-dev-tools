// The contextBridge. This is the only thing the renderer can reach node through.
//
// Note what is NOT exposed: no `invoke(channel, …)` escape hatch, no fs, no child_process. The
// renderer can call exactly the operations enumerated in ../shared/ipc.ts and nothing else.

import { contextBridge, ipcRenderer } from "electron";
import { IPC, IPC_EVENTS } from "../shared/ipc.js";
import type { MaestroApi, ProjectState, SaveInput, SessionLogEntry } from "../shared/ipc.js";

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
