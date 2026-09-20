import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useStore } from "@tanstack/react-store";
import Button from "@repo/ui/button";
import { Plus, Sparkles } from "lucide-react";
import { toast } from "@repo/ui/toast";
import TopNav from "../components/top-nav";
import WorkflowCanvas from "../components/workflow-canvas";
import {
  getMaestroConfig,
  submitMaestroConfig,
  type MaestroWorkflowV3,
  type MaestroConfigResult,
} from "../utils/maestro";
import {
  workflowStore,
  seedWorkflowStore,
  setActiveWorkflowIdx,
  setAgentsAvailable as storeSetAgentsAvailable,
  setSkillsAvailable as storeSetSkillsAvailable,
  setInstances as storeSetInstances,
  updateWorkflow as storeUpdateWorkflow,
  renameWorkflow as storeRenameWorkflow,
  removeWorkflow as storeRemoveWorkflow,
  addWorkflow as storeAddWorkflow,
} from "../store/workflow-store";

export const Route = createFileRoute("/workflows")({
  loader: () => getMaestroConfig(),
  component: WorkflowsPage,
});

type Phase = "idle" | "saving";

function WorkflowsPage() {
  const loaderData = Route.useLoaderData() as MaestroConfigResult;
  const { cwd, bundledAgents, projectSkills } = loaderData;

  // Seed the store once from loader data; subsequent re-renders won't clobber in-memory edits
  useEffect(() => { seedWorkflowStore(loaderData.config); }, [loaderData.config]);

  const config = useStore(workflowStore, (s) => s.config);
  const activeWorkflowIdx = useStore(workflowStore, (s) => s.activeWorkflowIdx);

  const [phase, setPhase] = useState<Phase>("idle");
  const [creatingWorkflow, setCreatingWorkflow] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState("");
  const [newWorkflowSource, setNewWorkflowSource] = useState<number | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  const allAgents = bundledAgents;
  const allSkills = projectSkills;

  const openCreateWorkflow = () => {
    setNewWorkflowName("");
    setNewWorkflowSource(null);
    setCreatingWorkflow(true);
    setTimeout(() => createInputRef.current?.focus(), 0);
  };

  const confirmCreateWorkflow = () => {
    if (!config) return;
    const source =
      newWorkflowSource !== null ? config.workflows[newWorkflowSource] : null;
    const name =
      newWorkflowName.trim() ||
      (source ? `Copy of ${source.name}` : `Workflow ${config.workflows.length + 1}`);
    const newWf: MaestroWorkflowV3 = source
      ? { name, nodes: structuredClone(source.nodes), edges: structuredClone(source.edges) }
      : { name, nodes: [], edges: [] };
    storeAddWorkflow(newWf);
    setCreatingWorkflow(false);
  };

  const cancelCreateWorkflow = () => setCreatingWorkflow(false);

  const handleSubmit = async () => {
    if (!config) return;
    setPhase("saving");
    await submitMaestroConfig({
      data: {
        cwd,
        sliceType: "workflows",
        slice: {
          cwd,
          agents_available: config.agents_available,
          skills_available: config.skills_available,
          workflow_instances: config.workflow_instances,
          workflows: config.workflows,
        },
      },
    });
    toast(
      <>
        Workflows saved to{" "}
        <span className="font-mono text-(--ink)">{(cwd || "<cwd>").replace(/\/+$/, "")}/.claude/maestro.json</span>.
      </>,
    );
    setPhase("idle");
  };

  // Guard: store not yet seeded
  if (!config) return null;

  const activeWorkflow = config.workflows[activeWorkflowIdx] ?? null;
  const availableSkillIds = config.skills_available;

  return (
    <div className="w-full h-screen bg-(--bg) font-sans text-(--ink) overflow-hidden flex flex-col">
      <TopNav
        workflowSelector={{
          workflows: config.workflows.map((wf, i) => wf.name || `Workflow ${i + 1}`),
          activeIndex: activeWorkflowIdx,
          onSelect: setActiveWorkflowIdx,
          onAdd: openCreateWorkflow,
          onRemove: storeRemoveWorkflow,
          onRename: storeRenameWorkflow,
        }}
      />

      <div
        className="flex-1 grid overflow-hidden"
        style={{ gridTemplateColumns: "280px 1fr" }}
      >
        {/* Left pane */}
        <div className="border-r border-(--line) overflow-y-auto flex flex-col p-4 gap-4">
          {/* Agents */}
          <div>
            <div className="text-[11px] font-semibold text-subtle uppercase tracking-wide mb-2">Agents</div>
            <div className="flex flex-col gap-0.5">
              {allAgents.map((agent) => {
                const checked = config.agents_available.includes(agent.id);
                return (
                  <label key={agent.id} title={agent.description} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-(--bg-elev) cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => storeSetAgentsAvailable(checked ? config.agents_available.filter((a) => a !== agent.id) : [...config.agents_available, agent.id])}
                      className="w-3.5 h-3.5 accent-primary cursor-pointer"
                    />
                    <span className="font-mono text-[13px] text-(--ink) truncate">{agent.id}</span>
                    <span className="ml-auto shrink-0 text-[9px] text-subtle uppercase tracking-wide">{agent.source}</span>
                  </label>
                );
              })}
              {allAgents.length === 0 && <p className="text-[12px] text-subtle">No agents found.</p>}
            </div>
            <button
              type="button"
              onClick={() => {
                const name = window.prompt("Agent ID:");
                if (name?.trim()) storeSetAgentsAvailable([...config.agents_available, name.trim()]);
              }}
              className="mt-1.5 flex items-center gap-1 text-[11px] text-(--ink-3) hover:text-(--ink) cursor-pointer py-0.5 px-1 rounded focus:outline-none"
            >
              <Plus size={10} /> Agent
            </button>
          </div>

          {/* Skills */}
          <div>
            <div className="text-[11px] font-semibold text-subtle uppercase tracking-wide mb-2">Skills</div>
            <div className="flex flex-col gap-0.5">
              {allSkills.map((skill) => {
                const checked = config.skills_available.includes(skill.id);
                return (
                  <label key={skill.id} title={skill.description} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-(--bg-elev) cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => storeSetSkillsAvailable(checked ? config.skills_available.filter((s) => s !== skill.id) : [...config.skills_available, skill.id])}
                      className="w-3.5 h-3.5 accent-primary cursor-pointer"
                    />
                    <span className="font-mono text-[13px] text-(--ink) truncate">{skill.id}</span>
                    <span className="ml-auto shrink-0 text-[9px] text-subtle uppercase tracking-wide">{skill.source}</span>
                  </label>
                );
              })}
              {allSkills.length === 0 && <p className="text-[12px] text-subtle">No skills found.</p>}
            </div>
            <button
              type="button"
              onClick={() => {
                const name = window.prompt("Skill ID:");
                if (name?.trim()) storeSetSkillsAvailable([...config.skills_available, name.trim()]);
              }}
              className="mt-1.5 flex items-center gap-1 text-[11px] text-(--ink-3) hover:text-(--ink) cursor-pointer py-0.5 px-1 rounded focus:outline-none"
            >
              <Plus size={10} /> Skill
            </button>
          </div>

          <div className="flex-1" />

          {/* Submit */}
          <Button
            variant="primary"
            icon={phase === "idle" ? <Sparkles size={14} /> : undefined}
            loading={phase === "saving"}
            onClick={() => void handleSubmit()}
          >
            {phase === "saving" ? "Saving…" : "Save workflows"}
          </Button>
        </div>

        {/* Center — canvas or create form */}
        <div className="flex flex-col overflow-hidden bg-(--bg-elev)">
          {creatingWorkflow ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="bg-(--bg) border border-(--line) rounded-xl p-6 shadow-lg w-80 flex flex-col gap-4">
                <h2 className="text-[15px] font-semibold text-(--ink) m-0">New workflow</h2>
                {config.workflows.length > 0 && (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold text-subtle uppercase tracking-wide">Start from</span>
                    <select
                      value={newWorkflowSource ?? ""}
                      onChange={(e) => setNewWorkflowSource(e.target.value === "" ? null : Number(e.target.value))}
                      className="w-full text-[13px] bg-(--bg-elev) border border-(--line) rounded-md px-3 py-2 text-(--ink) focus:outline-none focus:border-primary cursor-pointer"
                    >
                      <option value="">Empty workflow</option>
                      {config.workflows.map((wf, i) => (
                        <option key={i} value={i}>Copy of {wf.name || `Workflow ${i + 1}`}</option>
                      ))}
                    </select>
                  </label>
                )}
                <input
                  ref={createInputRef}
                  type="text"
                  value={newWorkflowName}
                  onChange={(e) => setNewWorkflowName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmCreateWorkflow(); if (e.key === "Escape") cancelCreateWorkflow(); }}
                  placeholder="e.g. Backend update"
                  className="w-full text-[13px] bg-(--bg-elev) border border-(--line) rounded-md px-3 py-2 text-(--ink) focus:outline-none focus:border-primary"
                />
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={cancelCreateWorkflow} className="px-3 py-1.5 text-[13px] rounded-lg bg-(--bg-elev) border border-(--line) text-(--ink-2) hover:text-(--ink) cursor-pointer focus:outline-none">
                    Cancel
                  </button>
                  <button type="button" onClick={confirmCreateWorkflow} className="px-3 py-1.5 text-[13px] rounded-lg bg-primary text-white cursor-pointer focus:outline-none hover:opacity-90">
                    Create
                  </button>
                </div>
              </div>
            </div>
          ) : activeWorkflow ? (
            <WorkflowCanvas
              workflow={activeWorkflow}
              workflowKey={activeWorkflowIdx}
              availableAgents={config.agents_available}
              availableSkills={availableSkillIds}
              instances={config.workflow_instances}
              onChange={(wf) => storeUpdateWorkflow(activeWorkflowIdx, wf)}
              onInstancesChange={storeSetInstances}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <p className="text-[13px] text-(--ink-2)">Add a workflow to get started.</p>
              <button
                type="button"
                onClick={openCreateWorkflow}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-white text-[13px] font-medium cursor-pointer focus:outline-none hover:opacity-90"
              >
                <Plus size={14} /> Add workflow
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
