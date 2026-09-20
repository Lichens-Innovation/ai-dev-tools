import { Store } from "@tanstack/store";
import type {
  MaestroConfigV3,
  MaestroWorkflowV3,
  MaestroInstanceV3,
} from "../utils/maestro";

export interface WorkflowEditState {
  config: MaestroConfigV3 | null;
  activeWorkflowIdx: number;
}

export const workflowStore = new Store<WorkflowEditState>({
  config: null,
  activeWorkflowIdx: 0,
});

/** Seed the store with loader data — only if currently empty, so in-memory edits survive re-renders. */
export function seedWorkflowStore(config: MaestroConfigV3) {
  if (workflowStore.state.config !== null) return;
  workflowStore.setState((s) => ({ ...s, config }));
}

export function setActiveWorkflowIdx(idx: number) {
  workflowStore.setState((s) => ({ ...s, activeWorkflowIdx: idx }));
}

export function setAgentsAvailable(ids: string[]) {
  workflowStore.setState((s) => {
    if (!s.config) return s;
    return { ...s, config: { ...s.config, agents_available: ids } };
  });
}

export function setSkillsAvailable(ids: string[]) {
  workflowStore.setState((s) => {
    if (!s.config) return s;
    return { ...s, config: { ...s.config, skills_available: ids } };
  });
}

export function setInstances(instances: MaestroInstanceV3[]) {
  workflowStore.setState((s) => {
    if (!s.config) return s;
    return { ...s, config: { ...s.config, workflow_instances: instances } };
  });
}

export function updateWorkflow(idx: number, wf: MaestroWorkflowV3) {
  workflowStore.setState((s) => {
    if (!s.config) return s;
    const next = [...s.config.workflows];
    next[idx] = wf;
    return { ...s, config: { ...s.config, workflows: next } };
  });
}

export function renameWorkflow(idx: number, name: string) {
  workflowStore.setState((s) => {
    if (!s.config) return s;
    const next = [...s.config.workflows];
    next[idx] = { ...next[idx], name };
    return { ...s, config: { ...s.config, workflows: next } };
  });
}

export function removeWorkflow(idx: number) {
  workflowStore.setState((s) => {
    if (!s.config) return s;
    const next = s.config.workflows.filter((_, i) => i !== idx);
    return {
      ...s,
      config: { ...s.config, workflows: next },
      activeWorkflowIdx: Math.max(0, s.activeWorkflowIdx >= idx ? s.activeWorkflowIdx - 1 : s.activeWorkflowIdx),
    };
  });
}

export function addWorkflow(wf: MaestroWorkflowV3) {
  workflowStore.setState((s) => {
    if (!s.config) return s;
    const next = [...s.config.workflows, wf];
    return {
      ...s,
      config: { ...s.config, workflows: next },
      activeWorkflowIdx: next.length - 1,
    };
  });
}
