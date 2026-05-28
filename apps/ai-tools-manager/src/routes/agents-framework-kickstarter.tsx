import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Button from "@repo/ui/button";
import { Field, Input } from "@repo/ui/field";
import ChipInput from "@repo/ui/chip-input";
import Select from "@repo/ui/select";
import ThemeToggle from "@repo/ui/theme-toggle";
import SuccessState from "@repo/ui/success-state";
import ShortcutsDialog from "@repo/ui/shortcuts-dialog";
import {
  Sparkles,
  Keyboard,
  Check,
  Plus,
  Trash2,
  Users,
  ListChecks,
  Wrench,
  Link2,
  GitBranch,
  Workflow as WorkflowIcon,
  BookOpenCheck,
} from "lucide-react";
import {
  getAfkFormData,
  submitAfkForm,
  cancelAfkForm,
  type AfkFormData,
} from "../utils/agents-framework-kickstarter";
import AfkYamlPreview from "../components/afk-yaml-preview";

// ── Schema ─────────────────────────────────────────────────────────
const stepSchema = z.object({
  type: z.enum(["agent", "skill", "human_approval", "human_review"]),
  id: z.string().optional(),
});

const afkSchema = z.object({
  agents: z.array(z.object({ id: z.string(), skills: z.array(z.string()) })),
  rules: z.array(z.string()),
  skills: z.array(
    z.object({
      id: z.string(),
      source: z.enum(["kickstarter", "project"]),
      user_invocable: z.boolean(),
    }),
  ),
  workflows: z.array(z.object({ name: z.string(), steps: z.array(stepSchema) })),
  handoffs: z.array(z.object({ scenario: z.string(), steps: z.array(stepSchema) })),
});

type AfkForm = z.infer<typeof afkSchema>;
type Phase = "idle" | "creating" | "done" | "cancelled";

const STEP_TYPES = [
  { id: "agent", name: "agent" },
  { id: "skill", name: "skill" },
  { id: "human_approval", name: "human_approval" },
  { id: "human_review", name: "human_review" },
];

// ── Route ──────────────────────────────────────────────────────────
export const Route = createFileRoute("/agents-framework-kickstarter")({
  loader: () => getAfkFormData(),
  component: AgentsFrameworkKickstarter,
});

const SHORTCUT_SECTIONS = [
  {
    title: "Navigation",
    items: [
      ["Jump to section 1–6", "⌘1–6"],
      ["Next / previous field", "Tab / ⇧Tab"],
    ] satisfies [string, string][],
  },
  {
    title: "Actions",
    items: [
      ["Create afk.yaml", "⌘↵"],
      ["Show this help", "?"],
      ["Close overlay", "Esc"],
    ] satisfies [string, string][],
  },
];

const SECTION_IDS = [
  "afk-sec-agents",
  "afk-sec-rules",
  "afk-sec-skills",
  "afk-sec-structure",
  "afk-sec-workflows",
  "afk-sec-handoffs",
];

// ── Component ──────────────────────────────────────────────────────
function AgentsFrameworkKickstarter() {
  const { cwd, bundledAgents, projectSkills } = Route.useLoaderData() as AfkFormData;
  const [phase, setPhase] = useState<Phase>("idle");
  const [helpOpen, setHelpOpen] = useState(false);

  const { control, handleSubmit, watch, setValue, getValues } = useForm<AfkForm>({
    resolver: zodResolver(afkSchema),
    defaultValues: {
      agents: [],
      rules: [],
      skills: [],
      workflows: [],
      handoffs: [],
    },
  });

  const agentsField = useFieldArray({ control, name: "agents" });
  const skillsField = useFieldArray({ control, name: "skills" });
  const workflowsField = useFieldArray({ control, name: "workflows" });
  const handoffsField = useFieldArray({ control, name: "handoffs" });

  const watchedAgents = watch("agents");
  const watchedRules = watch("rules");
  const watchedSkills = watch("skills");
  const watchedWorkflows = watch("workflows");
  const watchedHandoffs = watch("handoffs");

  const selectedAgentIds = new Set(watchedAgents.map((a) => a.id));
  const selectedSkillIds = new Set(watchedSkills.map((s) => s.id));

  const toggleAgent = (id: string) => {
    const idx = watchedAgents.findIndex((a) => a.id === id);
    if (idx >= 0) agentsField.remove(idx);
    else agentsField.append({ id, skills: [] });
  };

  const toggleSkill = (id: string) => {
    const idx = watchedSkills.findIndex((s) => s.id === id);
    if (idx >= 0) skillsField.remove(idx);
    else skillsField.append({ id, source: "project", user_invocable: false });
  };

  const setAgentSkills = (agentId: string, skills: string[]) => {
    const idx = watchedAgents.findIndex((a) => a.id === agentId);
    if (idx >= 0) setValue(`agents.${idx}.skills`, skills, { shouldDirty: true });
  };

  function jumpTo(n: number) {
    const id = SECTION_IDS[n - 1];
    if (!id) return;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.style.boxShadow = "0 0 0 4px var(--primary-glow)";
      setTimeout(() => {
        if (el) el.style.boxShadow = "none";
      }, 600);
    }
  }

  const onSubmit = async (values: AfkForm) => {
    setPhase("creating");
    await submitAfkForm({ data: { ...values, cwd } });
    setPhase("done");
  };

  const submitRef = useRef<() => void>(() => {});
  submitRef.current = () => void handleSubmit(onSubmit)();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = ["INPUT", "TEXTAREA"].includes(
        (document.activeElement as HTMLElement)?.tagName ?? "",
      );
      if ((e.metaKey || e.ctrlKey) && /^[1-6]$/.test(e.key)) {
        e.preventDefault();
        jumpTo(Number(e.key));
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        submitRef.current();
      } else if (e.key === "?" && !inField) {
        e.preventDefault();
        setHelpOpen(true);
      } else if (e.key === "Escape") {
        setHelpOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Suppress unused-getValues warning by passing through; kept for debugging.
  void getValues;

  if (phase === "cancelled") {
    return (
      <div className="w-full h-screen bg-(--bg) font-sans flex items-center justify-center">
        <div className="text-center">
          <p className="text-base text-(--ink-2)">AFK setup cancelled.</p>
          <p className="text-[13px] text-subtle mt-1.5">You can close this tab.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-(--bg) font-sans text-(--ink) overflow-hidden">
      <div
        className="h-full grid transition-[grid-template-columns] duration-300 ease-out"
        style={{ gridTemplateColumns: phase === "done" ? "1fr" : "minmax(0, 1fr) 460px" }}
      >
        {/* Left — Form */}
        <div className="overflow-y-auto px-10 py-8">
          <div className="max-w-180 mx-auto">
            {phase === "done" ? (
              <SuccessState
                icon={<Check size={28} strokeWidth={2.4} />}
                title="afk.yaml is being written"
                description={
                  <>
                    Claude will write it to{" "}
                    <span className="font-mono text-(--ink-2)">
                      {(cwd || "<cwd>").replace(/\/+$/, "")}/afk.yaml
                    </span>
                    . You can close this tab.
                  </>
                }
              />
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                  <h1 className="m-0 text-2xl font-bold text-(--ink) tracking-[-0.5px]">
                    Agents Framework Kickstarter
                  </h1>
                  <div className="flex-1" />
                  <ThemeToggle />
                  <button
                    type="button"
                    onClick={() => setHelpOpen(true)}
                    title="Keyboard shortcuts (?)"
                    className="w-7.5 h-7.5 rounded-lg bg-(--bg-elev) border border-(--line) flex items-center justify-center text-subtle text-[13px] font-bold cursor-pointer focus:outline-none focus:shadow-none"
                  >
                    ?
                  </button>
                </div>
                <p className="m-0 mb-4.5 text-[13px] text-subtle">
                  Pick the agents, rules, and skills for this project. The result is written to{" "}
                  <span className="font-mono">afk.yaml</span> at the project root, where the
                  PreToolUse hook reads it to inject project skills into each subagent invocation.
                </p>

                {/* 1. Agents */}
                <Section id={SECTION_IDS[0]} number={1} icon={<Users size={14} />} title="Agents">
                  {bundledAgents.length === 0 ? (
                    <p className="text-[13px] text-subtle">
                      No bundled agents found. Check that the plugin is installed correctly.
                    </p>
                  ) : (
                    <div className="grid gap-2">
                      {bundledAgents.map((a) => (
                        <ToggleCard
                          key={a.id}
                          selected={selectedAgentIds.has(a.id)}
                          onClick={() => toggleAgent(a.id)}
                          title={a.id}
                          description={a.description}
                        />
                      ))}
                    </div>
                  )}
                </Section>

                {/* 2. Rules */}
                <Section id={SECTION_IDS[1]} number={2} icon={<BookOpenCheck size={14} />} title="Rules">
                  <Field
                    id="afk-rules-row"
                    label="Rule names"
                    hint="Free-form list of rule ids (e.g. db-standards). Press Enter to add each."
                  >
                    <Controller
                      name="rules"
                      control={control}
                      render={({ field }) => (
                        <ChipInput
                          id="afk-rules"
                          values={field.value}
                          onChange={field.onChange}
                          placeholder="e.g. db-standards"
                        />
                      )}
                    />
                  </Field>
                </Section>

                {/* 3. Skills */}
                <Section id={SECTION_IDS[2]} number={3} icon={<Wrench size={14} />} title="Skills">
                  {projectSkills.length === 0 ? (
                    <p className="text-[13px] text-subtle">
                      No skills found under{" "}
                      <span className="font-mono text-(--ink-2)">
                        {(cwd || "<cwd>").replace(/\/+$/, "")}/.claude/skills/
                      </span>
                      . Create some with <span className="font-mono">/create-skill</span> first.
                    </p>
                  ) : (
                    <div className="grid gap-2">
                      {projectSkills.map((s) => {
                        const skillIdx = watchedSkills.findIndex((x) => x.id === s.id);
                        const selected = skillIdx >= 0;
                        return (
                          <div key={s.id} className="flex items-stretch gap-2">
                            <div className="flex-1">
                              <ToggleCard
                                selected={selected}
                                onClick={() => toggleSkill(s.id)}
                                title={s.id}
                                description={s.description}
                              />
                            </div>
                            {selected && (
                              <label className="flex items-center gap-2 px-3 rounded-lg bg-(--bg-elev) border border-(--line) text-[12px] text-(--ink-2) shrink-0">
                                <Controller
                                  name={`skills.${skillIdx}.user_invocable` as const}
                                  control={control}
                                  render={({ field }) => (
                                    <input
                                      type="checkbox"
                                      checked={field.value}
                                      onChange={(e) => field.onChange(e.target.checked)}
                                    />
                                  )}
                                />
                                user-invocable
                              </label>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Section>

                {/* 4. Structure */}
                <Section id={SECTION_IDS[3]} number={4} icon={<Link2 size={14} />} title="Structure (agent → skills)">
                  {watchedAgents.length === 0 ? (
                    <p className="text-[13px] text-subtle">Select agents in section 1 first.</p>
                  ) : watchedSkills.length === 0 ? (
                    <p className="text-[13px] text-subtle">Select skills in section 3 first.</p>
                  ) : (
                    <div className="grid gap-3">
                      {watchedAgents.map((a) => (
                        <Field
                          key={a.id}
                          id={`afk-struct-${a.id}`}
                          label={a.id}
                          hint="Skills the hook will inject when this subagent is invoked."
                        >
                          <ChipMultiSelect
                            options={watchedSkills.map((s) => s.id)}
                            value={a.skills}
                            onChange={(next) => setAgentSkills(a.id, next)}
                          />
                        </Field>
                      ))}
                    </div>
                  )}
                </Section>

                {/* 5. Workflows */}
                <Section id={SECTION_IDS[4]} number={5} icon={<WorkflowIcon size={14} />} title="Workflows">
                  <StepListEditor
                    items={watchedWorkflows}
                    nameKey="name"
                    addLabel="Add workflow"
                    namePlaceholder="e.g. Feature"
                    onAdd={() => workflowsField.append({ name: "", steps: [] })}
                    onRemove={(i) => workflowsField.remove(i)}
                    onNameChange={(i, v) => setValue(`workflows.${i}.name`, v, { shouldDirty: true })}
                    onStepsChange={(i, steps) => setValue(`workflows.${i}.steps`, steps, { shouldDirty: true })}
                    stepOptions={selectedAgentIds}
                    skillOptions={selectedSkillIds}
                    allowHumanSteps
                  />
                </Section>

                {/* 6. Handoffs */}
                <Section id={SECTION_IDS[5]} number={6} icon={<GitBranch size={14} />} title="Handoffs">
                  <StepListEditor
                    items={watchedHandoffs.map((h) => ({ name: h.scenario, steps: h.steps }))}
                    nameKey="scenario"
                    addLabel="Add handoff"
                    namePlaceholder="e.g. Routes"
                    onAdd={() => handoffsField.append({ scenario: "", steps: [] })}
                    onRemove={(i) => handoffsField.remove(i)}
                    onNameChange={(i, v) => setValue(`handoffs.${i}.scenario`, v, { shouldDirty: true })}
                    onStepsChange={(i, steps) => setValue(`handoffs.${i}.steps`, steps, { shouldDirty: true })}
                    stepOptions={selectedAgentIds}
                    skillOptions={selectedSkillIds}
                    allowHumanSteps={false}
                  />
                </Section>

                {/* Submit row */}
                <div className="mt-6 pt-4 border-t border-(--line) flex items-center gap-3">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void cancelAfkForm({ data: undefined }).then(() => setPhase("cancelled"))
                    }
                  >
                    Cancel
                  </Button>
                  <div className="flex-1" />
                  <Button
                    variant="primary"
                    icon={phase === "idle" ? <Sparkles size={14} /> : undefined}
                    loading={phase === "creating"}
                    onClick={() => submitRef.current()}
                  >
                    {phase === "creating" ? "Writing…" : "Create afk.yaml"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right — Live YAML preview */}
        {phase !== "done" && (
          <div className="border-l border-(--line) overflow-y-auto flex flex-col">
            <AfkYamlPreview
              agents={watchedAgents}
              rules={watchedRules}
              skills={watchedSkills}
              workflows={watchedWorkflows}
              handoffs={watchedHandoffs}
              cwd={cwd}
            />
          </div>
        )}
      </div>
      <ShortcutsDialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        titleIcon={<Keyboard size={15} />}
        sections={SHORTCUT_SECTIONS}
      />
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

function Section({
  id,
  number,
  icon,
  title,
  children,
}: {
  id: string;
  number: number;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-6 pt-5 border-t border-(--line) rounded-md transition-shadow">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-md bg-(--primary-dim) text-primary flex items-center justify-center text-[11px] font-semibold">
          {number}
        </div>
        <div className="flex items-center gap-1.5 text-[14px] font-semibold text-(--ink)">
          {icon}
          {title}
        </div>
      </div>
      {children}
    </section>
  );
}

function ToggleCard({
  selected,
  onClick,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left px-3.5 py-2.5 rounded-lg border transition-colors cursor-pointer focus:outline-none ${
        selected
          ? "border-(--primary) bg-(--primary-dim) text-(--ink)"
          : "border-(--line) bg-(--bg-elev) text-(--ink-2) hover:border-(--ink-4)"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center ${
            selected ? "border-(--primary) bg-(--primary)" : "border-(--ink-4)"
          }`}
        >
          {selected && <Check size={10} strokeWidth={3} className="text-white" />}
        </span>
        <span className="font-mono text-[13px] text-(--ink)">{title}</span>
      </div>
      {description && <p className="m-0 mt-1 ml-5.5 text-[12px] text-subtle leading-snug">{description}</p>}
    </button>
  );
}

function ChipMultiSelect({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.length === 0 ? (
        <span className="text-[12px] text-subtle">No skills selected upstream.</span>
      ) : (
        options.map((o) => {
          const selected = value.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => toggle(o)}
              className={`px-2.5 py-1 rounded-full font-mono text-[12px] border cursor-pointer transition-colors focus:outline-none ${
                selected
                  ? "border-(--primary) bg-(--primary-dim) text-(--ink)"
                  : "border-(--line) bg-(--bg-elev) text-(--ink-2) hover:border-(--ink-4)"
              }`}
            >
              {o}
            </button>
          );
        })
      )}
    </div>
  );
}

type AfkStepType = "agent" | "skill" | "human_approval" | "human_review";
interface AfkStepLike {
  type: AfkStepType;
  id?: string;
}
interface NamedStepItem {
  name: string;
  steps: AfkStepLike[];
}

function StepListEditor({
  items,
  nameKey,
  addLabel,
  namePlaceholder,
  onAdd,
  onRemove,
  onNameChange,
  onStepsChange,
  stepOptions,
  skillOptions,
  allowHumanSteps,
}: {
  items: NamedStepItem[];
  nameKey: "name" | "scenario";
  addLabel: string;
  namePlaceholder: string;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onNameChange: (i: number, v: string) => void;
  onStepsChange: (i: number, steps: AfkStepLike[]) => void;
  stepOptions: Set<string>;
  skillOptions: Set<string>;
  allowHumanSteps: boolean;
}) {
  const typeOptions = allowHumanSteps
    ? STEP_TYPES
    : STEP_TYPES.filter((t) => t.id === "agent" || t.id === "skill");

  return (
    <div className="grid gap-3">
      {items.map((item, i) => {
        const addStep = () => onStepsChange(i, [...item.steps, { type: "agent", id: "" }]);
        const updateStep = (j: number, patch: Partial<AfkStepLike>) => {
          const next: AfkStepLike[] = item.steps.map((s, idx) =>
            idx === j ? { ...s, ...patch } : s,
          );
          onStepsChange(i, next);
        };
        const removeStep = (j: number) => onStepsChange(i, item.steps.filter((_, idx) => idx !== j));

        return (
          <div key={i} className="p-3 rounded-lg bg-(--bg-elev) border border-(--line)">
            <div className="flex items-center gap-2 mb-2">
              <Input
                value={item.name}
                onChange={(v) => onNameChange(i, v)}
                placeholder={namePlaceholder}
                aria-label={`${nameKey} name`}
              />
              <Button variant="ghost" icon={<Trash2 size={13} />} onClick={() => onRemove(i)}>
                Remove
              </Button>
            </div>

            <div className="grid gap-1.5 pl-3 border-l-2 border-(--line)">
              {item.steps.length === 0 && (
                <span className="text-[12px] text-subtle">No steps yet.</span>
              )}
              {item.steps.map((step, j) => {
                const idOptions =
                  step.type === "agent"
                    ? Array.from(stepOptions).map((s) => ({ id: s, name: s }))
                    : step.type === "skill"
                      ? Array.from(skillOptions).map((s) => ({ id: s, name: s }))
                      : [];
                const needsId = step.type === "agent" || step.type === "skill";
                return (
                  <div key={j} className="flex items-center gap-2">
                    <div className="w-[160px]">
                      <Select
                        value={step.type}
                        options={typeOptions}
                        onChange={(v) =>
                          updateStep(j, {
                            type: v as AfkStepType,
                            id: needsId ? step.id : undefined,
                          })
                        }
                      />
                    </div>
                    {needsId && (
                      <div className="flex-1">
                        <Select
                          value={step.id ?? ""}
                          options={idOptions}
                          onChange={(v) => updateStep(j, { id: v })}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeStep(j)}
                      className="text-(--ink-4) hover:text-(--ink-2) cursor-pointer focus:outline-none"
                      title="Remove step"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
              <div>
                <Button variant="ghost" icon={<Plus size={13} />} onClick={addStep}>
                  Add step
                </Button>
              </div>
            </div>
          </div>
        );
      })}
      <div>
        <Button variant="ghost" icon={<ListChecks size={13} />} onClick={onAdd}>
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
