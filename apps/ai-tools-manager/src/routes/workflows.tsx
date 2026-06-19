import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import Button from "@repo/ui/button";
import { Check, Plus, Sparkles } from "lucide-react";
import SuccessState from "@repo/ui/success-state";
import TopNav from "../components/top-nav";
import WorkflowCanvas from "../components/workflow-canvas";
import AfkYamlPreview from "../components/afk-yaml-preview";
import {
  getAfkConfig,
  submitAfkConfig,
  type AfkConfigV3,
  type AfkWorkflowV3,
  type AfkInstanceV3,
  type AfkConfigResult,
} from "../utils/agents-framework-kickstarter";

export const Route = createFileRoute("/workflows")({
  loader: () => getAfkConfig(),
  component: WorkflowsPage,
});

type Phase = "idle" | "saving" | "done";

function WorkflowsPage() {
  const loaderData = Route.useLoaderData() as AfkConfigResult;
  const { cwd, bundledAgents, projectSkills } = loaderData;

  const [config, setConfig] = useState<AfkConfigV3>(loaderData.config);
  const [activeWorkflowIdx, setActiveWorkflowIdx] = useState<number>(0);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [creatingWorkflow, setCreatingWorkflow] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState("");
  const [newWorkflowSource, setNewWorkflowSource] = useState<number | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  const allAgents = bundledAgents;
  const allSkills = projectSkills;

  const setAgentsAvailable = (ids: string[]) => {
    setConfig((c) => ({ ...c, agents_available: ids }));
  };

  const setSkillsAvailable = (ids: string[]) => {
    setConfig((c) => ({ ...c, skills_available: ids }));
  };

  const setMainSessionSkills = (skills: string[]) => {
    setConfig((c) => ({ ...c, main_session_loaded_skills: skills }));
  };

  const setInstances = (instances: AfkInstanceV3[]) => {
    setConfig((c) => ({ ...c, workflow_instances: instances }));
  };

  const addWorkflow = () => {
    setNewWorkflowName("");
    setNewWorkflowSource(null);
    setCreatingWorkflow(true);
    setTimeout(() => createInputRef.current?.focus(), 0);
  };

  const confirmCreateWorkflow = () => {
    const source =
      newWorkflowSource !== null ? config.workflows[newWorkflowSource] : null;
    const name =
      newWorkflowName.trim() ||
      (source ? `Copy of ${source.name}` : `Workflow ${config.workflows.length + 1}`);
    const newWf: AfkWorkflowV3 = source
      ? { name, nodes: structuredClone(source.nodes), edges: structuredClone(source.edges) }
      : { name, nodes: [], edges: [] };
    const next = [...config.workflows, newWf];
    setConfig((c) => ({ ...c, workflows: next }));
    setActiveWorkflowIdx(next.length - 1);
    setCreatingWorkflow(false);
  };

  const cancelCreateWorkflow = () => setCreatingWorkflow(false);

  // Keep useEffect import used
  useEffect(() => {}, []);

  const renameWorkflow = (idx: number, name: string) => {
    setConfig((c) => {
      const next = [...c.workflows];
      next[idx] = { ...next[idx], name };
      return { ...c, workflows: next };
    });
  };

  const updateWorkflow = (idx: number, wf: AfkWorkflowV3) => {
    setConfig((c) => {
      const next = [...c.workflows];
      next[idx] = wf;
      return { ...c, workflows: next };
    });
  };

  const removeWorkflow = (idx: number) => {
    setConfig((c) => {
      const next = c.workflows.filter((_, i) => i !== idx);
      return { ...c, workflows: next };
    });
    setActiveWorkflowIdx((i) => Math.max(0, i >= idx ? i - 1 : i));
  };

  const handleSubmit = async () => {
    setPhase("saving");
    await submitAfkConfig({
      data: {
        cwd,
        sliceType: "workflows",
        slice: {
          cwd,
          agents_available: config.agents_available,
          skills_available: config.skills_available,
          main_session_loaded_skills: config.main_session_loaded_skills,
          workflow_instances: config.workflow_instances,
          workflows: config.workflows,
        },
      },
    });
    setPhase("done");
  };

  if (phase === "done") {
    return (
      <div className="w-full h-screen bg-(--bg) font-sans flex flex-col">
        <TopNav />
        <div className="flex-1 flex items-center justify-center">
          <SuccessState
            icon={<Check size={28} strokeWidth={2.4} />}
            title="Workflows saved"
            description={
              <>
                afk.yaml will be written to{" "}
                <span className="font-mono text-(--ink-2)">{(cwd || "<cwd>").replace(/\/+$/, "")}/afk.yaml</span>.
              </>
            }
          />
        </div>
      </div>
    );
  }

  const activeWorkflow = config.workflows[activeWorkflowIdx] ?? null;
  const availableSkillIds = config.skills_available;

  return (
    <div className="w-full h-screen bg-(--bg) font-sans text-(--ink) overflow-hidden flex flex-col">
      <TopNav
        previewOpen={previewOpen}
        onPreviewToggle={() => setPreviewOpen((v) => !v)}
        workflowSelector={{
          workflows: config.workflows.map((wf, i) => wf.name || `Workflow ${i + 1}`),
          activeIndex: activeWorkflowIdx,
          onSelect: setActiveWorkflowIdx,
          onAdd: addWorkflow,
          onRemove: removeWorkflow,
          onRename: renameWorkflow,
        }}
      />

      <div
        className="flex-1 grid overflow-hidden transition-[grid-template-columns] duration-300 ease-out"
        style={{
          gridTemplateColumns: previewOpen ? "280px 1fr 460px" : "280px 1fr",
        }}
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
                      onChange={() => setAgentsAvailable(checked ? config.agents_available.filter((a) => a !== agent.id) : [...config.agents_available, agent.id])}
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
                if (name?.trim()) setAgentsAvailable([...config.agents_available, name.trim()]);
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
                      onChange={() => setSkillsAvailable(checked ? config.skills_available.filter((s) => s !== skill.id) : [...config.skills_available, skill.id])}
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
                if (name?.trim()) setSkillsAvailable([...config.skills_available, name.trim()]);
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
              availableAgents={config.agents_available}
              availableSkills={availableSkillIds}
              mainSessionSkills={config.main_session_loaded_skills}
              instances={config.workflow_instances}
              onChange={(wf) => updateWorkflow(activeWorkflowIdx, wf)}
              onMainSessionSkillsChange={setMainSessionSkills}
              onInstancesChange={setInstances}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <p className="text-[13px] text-(--ink-2)">Add a workflow to get started.</p>
              <button
                type="button"
                onClick={addWorkflow}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-white text-[13px] font-medium cursor-pointer focus:outline-none hover:opacity-90"
              >
                <Plus size={14} /> Add workflow
              </button>
            </div>
          )}
        </div>

        {/* Right — YAML preview */}
        {previewOpen && (
          <div className="border-l border-(--line) overflow-y-auto flex flex-col">
            <AfkYamlPreview config={config} cwd={cwd} />
          </div>
        )}
      </div>
    </div>
  );
}
