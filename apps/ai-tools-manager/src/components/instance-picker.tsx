import type { AfkInstanceV3 } from "../utils/agents-framework-kickstarter";
import SkillChecklist from "./skill-checklist";

export interface InstancePickerValue {
  mode: "reuse" | "create";
  reuseInstanceName: string;
  newAgent: string;
  newName: string;
  newSkills: string[];
}

export function blankInstancePicker(defaultAgent = ""): InstancePickerValue {
  return { mode: "reuse", reuseInstanceName: "", newAgent: defaultAgent, newName: "", newSkills: [] };
}

// Resolve the picker into an instance to place. Returns null when the selection
// is invalid (no reuse target, blank/duplicate new name, already-placed instance).
export function resolveInstanceFromPicker(
  v: InstancePickerValue,
  opts: { instances: AfkInstanceV3[]; placedNames: Set<string>; availableAgents: string[] },
): { instance: AfkInstanceV3; isNew: boolean } | null {
  if (v.mode === "reuse") {
    if (!v.reuseInstanceName || opts.placedNames.has(v.reuseInstanceName)) return null;
    const inst = opts.instances.find((i) => i.name === v.reuseInstanceName);
    if (!inst) return null;
    return { instance: inst, isNew: false };
  }
  const name = v.newName.trim();
  if (!name) return null;
  if (opts.instances.some((i) => i.name === name)) return null; // name already used
  return {
    instance: { name, agent: v.newAgent || opts.availableAgents[0] || "agent", skills: v.newSkills },
    isNew: true,
  };
}

// Reuse-an-existing or create-a-new workflow instance. Shared by the add-step and
// condition modals in the workflow canvas.
export default function InstancePicker({
  value,
  onChange,
  availableAgents,
  availableSkills,
  reusableInstances,
  existingInstanceNames = [],
  onEnter,
  onEscape,
}: {
  value: InstancePickerValue;
  onChange: (next: InstancePickerValue) => void;
  availableAgents: string[];
  availableSkills: string[];
  reusableInstances: AfkInstanceV3[];
  // All instance names already in the config — used to flag duplicate new names.
  existingInstanceNames?: string[];
  onEnter?: () => void;
  onEscape?: () => void;
}) {
  const set = (patch: Partial<InstancePickerValue>) => onChange({ ...value, ...patch });
  const trimmedName = value.newName.trim();
  const nameTaken = trimmedName !== "" && existingInstanceNames.includes(trimmedName);
  const tabClass = (active: boolean) =>
    `flex-1 py-1 text-[11px] font-medium cursor-pointer focus:outline-none transition-colors ${
      active ? "bg-primary text-white" : "bg-(--bg-elev) text-(--ink-2) hover:bg-(--bg)"
    }`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex rounded-lg overflow-hidden border border-(--line)">
        <button type="button" onClick={() => set({ mode: "reuse" })} className={tabClass(value.mode === "reuse")}>
          Reuse instance
        </button>
        <button type="button" onClick={() => set({ mode: "create" })} className={tabClass(value.mode === "create")}>
          New instance
        </button>
      </div>

      {value.mode === "reuse" ? (
        reusableInstances.length === 0 ? (
          <p className="text-[12px] text-subtle">
            No available instances. All existing instances are placed, or none have been created yet. Switch to "New
            instance" to create one.
          </p>
        ) : (
          <select
            value={value.reuseInstanceName}
            onChange={(e) => set({ reuseInstanceName: e.target.value })}
            className="w-full text-[12px] bg-(--bg-elev) border border-(--line) rounded px-2 py-1.5 text-(--ink) focus:outline-none focus:border-primary"
          >
            <option value="">Select instance…</option>
            {reusableInstances.map((i) => (
              <option key={i.name} value={i.name}>
                {i.name} (@{i.agent})
              </option>
            ))}
          </select>
        )
      ) : (
        <>
          <select
            value={value.newAgent}
            onChange={(e) => set({ newAgent: e.target.value })}
            className="w-full text-[12px] bg-(--bg-elev) border border-(--line) rounded px-2 py-1.5 text-(--ink) focus:outline-none focus:border-primary"
          >
            <option value="">Pick subagent…</option>
            {availableAgents.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Instance name (e.g. backend_default)"
            value={value.newName}
            onChange={(e) => set({ newName: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !nameTaken) onEnter?.();
              if (e.key === "Escape") onEscape?.();
            }}
            aria-invalid={nameTaken}
            className={`w-full text-[12px] bg-(--bg-elev) border rounded px-2 py-1.5 text-(--ink) focus:outline-none ${
              nameTaken ? "border-red-400 focus:border-red-500" : "border-(--line) focus:border-primary"
            }`}
          />
          {nameTaken && (
            <p className="text-[11px] text-red-500">
              An instance named “{trimmedName}” already exists. Pick a different name or reuse it instead.
            </p>
          )}
          <SkillChecklist skills={availableSkills} value={value.newSkills} onChange={(newSkills) => set({ newSkills })} />
        </>
      )}
    </div>
  );
}
