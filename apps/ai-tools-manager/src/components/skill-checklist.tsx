// Scrollable checkbox list of skill ids. Shared by the workflow-canvas modals
// (add-step, condition, edit-instance) to attach skills to an instance.
export default function SkillChecklist({
  skills,
  value,
  onChange,
  maxHeight = "max-h-40",
  size = "sm",
  emptyHint,
}: {
  skills: string[];
  value: string[];
  onChange: (next: string[]) => void;
  maxHeight?: string;
  size?: "sm" | "md";
  // When the available-skills list is empty: if provided, render this hint
  // instead of nothing (so the Skills section never silently disappears).
  emptyHint?: string;
}) {
  if (skills.length === 0) {
    if (!emptyHint) return null;
    return (
      <div className="flex flex-col gap-1">
        <div className="text-[10px] text-subtle uppercase tracking-wide">Skills</div>
        <p className="text-[12px] text-subtle">{emptyHint}</p>
      </div>
    );
  }
  const box = size === "md" ? "w-3.5 h-3.5" : "w-3 h-3";
  const text = size === "md" ? "text-[12px]" : "text-[11px]";
  const toggle = (s: string) =>
    onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]);
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] text-subtle uppercase tracking-wide">Skills</div>
      <div className={`flex flex-col gap-1 ${maxHeight} overflow-y-auto`}>
        {skills.map((s) => (
          <label key={s} className="flex items-center gap-2 py-0.5 px-1 rounded hover:bg-(--bg-elev) cursor-pointer">
            <input
              type="checkbox"
              checked={value.includes(s)}
              onChange={() => toggle(s)}
              className={`${box} accent-primary cursor-pointer`}
            />
            <span className={`font-mono ${text} text-(--ink)`}>{s}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
