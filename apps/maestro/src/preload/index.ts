// The contextBridge. This is the only thing the renderer can reach node through.
//
// Note what is NOT exposed: no `invoke(channel, …)` escape hatch, no fs, no child_process. The
// renderer can call exactly the operations enumerated in ../shared/ipc.ts and nothing else.

import { contextBridge, ipcRenderer } from "electron";
import { IPC, IPC_EVENTS } from "../shared/ipc.js";
import type { ClaudeOutputChunk, MaestroApi, ProjectState, SaveInput, SessionLogEntry } from "../shared/ipc.js";

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
    tools: () => ipcRenderer.invoke(IPC.toolsData),
    docs: () => ipcRenderer.invoke(IPC.docsData),
    // A slug, never a path: main joins it onto the open project's docs directory and refuses
    // anything with a separator or a dot in it, so this cannot be steered at another file.
    doc: (slug) => ipcRenderer.invoke(IPC.docContent, slug),
  },
  config: {
    save: (input: SaveInput) => ipcRenderer.invoke(IPC.configSave, input),
  },
  tasks: {
    list: () => ipcRenderer.invoke(IPC.tasksList),
    close: (filename) => ipcRenderer.invoke(IPC.tasksClose, filename),
  },
  create: {
    options: () => ipcRenderer.invoke(IPC.createOptions),
    // A request, never a path and never prompt text — same discipline as the claude channels
    // below, because the create routes reach the model through exactly those.
    scaffold: (request) => ipcRenderer.invoke(IPC.createScaffold, request),
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
  stats: {
    // A view name, never an argv: main resolves `ccusage` and builds the command, exactly as it
    // builds a prompt for the claude channels. The renderer picks a tab; it cannot pick a binary.
    preview: (view) => ipcRenderer.invoke(IPC.statsPreview, view),
    // The token decides what runs. `view` rides along only so the result can be filed against the
    // tab that asked — the invocation itself comes from the token, same as `claude:run`.
    run: (token, view) => ipcRenderer.invoke(IPC.statsRun, token, view),
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
