// Guards on the /workflows edit store's project identity.
//
// The store is a module singleton that outlives every route render, and seeding it is a
// conditional: keep the in-memory config (so an invalidation mid-edit doesn't discard unsaved
// canvas work) or replace it (so a project switch doesn't leave the previous project's workflows
// on screen). Getting that condition wrong is silent and expensive — the canvas showed project A
// while the window was on project B, and pressing Save wrote A's workflows into B's maestro.json.
// Nothing about that fails loudly, which is why it is pinned here.

import { describe, it, expect, beforeEach } from "vitest";
import { workflowStore, seedWorkflowStore, setActiveWorkflowIdx, addWorkflow } from "../src/renderer/src/store/workflow-store.js";
import type { MaestroConfigV3, MaestroWorkflowV3 } from "../src/renderer/src/utils/maestro.js";

const PROJECT_A = "/tmp/project-a";
const PROJECT_B = "/tmp/project-b";

const wf = (name: string): MaestroWorkflowV3 => ({ name, nodes: [], edges: [] });

const config = (...names: string[]): MaestroConfigV3 => ({
  version: 3,
  agents_available: [],
  skills_available: [],
  workflow_instances: [],
  workflows: names.map(wf),
  rules: [],
});

const names = () => workflowStore.state.config?.workflows.map((w) => w.name) ?? null;

beforeEach(() => {
  workflowStore.setState(() => ({ config: null, projectRoot: null, activeWorkflowIdx: 0 }));
});

describe("seedWorkflowStore", () => {
  it("seeds an empty store from loader data", () => {
    seedWorkflowStore(config("alpha"), PROJECT_A);
    expect(names()).toEqual(["alpha"]);
    expect(workflowStore.state.projectRoot).toBe(PROJECT_A);
  });

  it("keeps in-memory edits when the loader re-runs for the same project", () => {
    seedWorkflowStore(config("alpha"), PROJECT_A);
    addWorkflow(wf("unsaved-edit"));

    seedWorkflowStore(config("alpha"), PROJECT_A);

    expect(names()).toEqual(["alpha", "unsaved-edit"]);
  });

  it("replaces the config when the loader re-runs for a DIFFERENT project", () => {
    seedWorkflowStore(config("alpha"), PROJECT_A);
    addWorkflow(wf("unsaved-edit"));

    seedWorkflowStore(config("beta"), PROJECT_B);

    // Not ["alpha", "unsaved-edit"] — carrying those over is what wrote one project's
    // workflows into another project's maestro.json.
    expect(names()).toEqual(["beta"]);
    expect(workflowStore.state.projectRoot).toBe(PROJECT_B);
  });

  it("resets the selected workflow index on a project switch", () => {
    seedWorkflowStore(config("alpha", "second", "third"), PROJECT_A);
    setActiveWorkflowIdx(2);

    // The incoming project has one workflow; index 2 would point past the end and blank the canvas.
    seedWorkflowStore(config("beta"), PROJECT_B);

    expect(workflowStore.state.activeWorkflowIdx).toBe(0);
  });

  it("does not reset the selected workflow index on a same-project re-seed", () => {
    seedWorkflowStore(config("alpha", "second"), PROJECT_A);
    setActiveWorkflowIdx(1);

    seedWorkflowStore(config("alpha", "second"), PROJECT_A);

    expect(workflowStore.state.activeWorkflowIdx).toBe(1);
  });
});
