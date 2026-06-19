import { useState } from "react";
import { ArrowDown } from "lucide-react";
import type { Instance } from "../utils/session-log";

interface SessionLogCardsProps {
  instances: Instance[];
  activeId: number | null;
  onSelect: (id: number) => void;
}

function StatusBadge({ status, label }: { status: Instance["status"]; label: string | null }) {
  if (!status) return null;
  if (status === "success") {
    return <span className="text-[11px] font-medium text-(--green)">success</span>;
  }
  if (status === "condition") {
    return (
      <span className="text-[11px] font-medium text-(--red)">
        failure{label ? ` · ${label}` : ""}
      </span>
    );
  }
  // unknown
  return <span className="text-[11px] text-(--ink-3)">—</span>;
}

function HoverPopup({ input, output }: { input: string | null; output: string | null }) {
  return (
    <div className="absolute left-full ml-3 top-0 z-50 w-[30rem] bg-(--bg) border border-(--line) rounded-lg shadow-xl p-0 overflow-hidden">
      <div className="max-h-[80vh] overflow-y-auto">
        <section className="p-3 border-b border-(--line)">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-(--ink-3) mb-1.5">
            Input
          </div>
          {input ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-(--ink-2) leading-[1.6] m-0">
              {input}
            </pre>
          ) : (
            <span className="text-[11px] text-(--ink-3) italic">No message captured</span>
          )}
        </section>
        <section className="p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-(--ink-3) mb-1.5">
            Output
          </div>
          {output ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-(--ink-2) leading-[1.6] m-0">
              {output}
            </pre>
          ) : (
            <span className="text-[11px] text-(--ink-3) italic">No message captured</span>
          )}
        </section>
      </div>
    </div>
  );
}

export default function SessionLogCards({ instances, activeId, onSelect }: SessionLogCardsProps) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  return (
    <div className="border-r border-(--line) overflow-y-auto flex flex-col items-center py-6 px-4 gap-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-(--ink-3) mb-5">
        Agents Flow
      </div>
      {instances.map((inst, idx) => {
        const isActive = inst.id === activeId;
        const isHovered = inst.id === hoveredId;
        const hasPopup = !!(inst.input || inst.output) && inst.origin !== "main_session";
        const isLast = idx === instances.length - 1;

        return (
          <div key={inst.id} className="flex flex-col items-center w-full">
            {/* Card — wrapped in a relative container for the hover popup */}
            <div
              className="relative w-56"
              onMouseEnter={() => setHoveredId(inst.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <button
                type="button"
                onClick={() => onSelect(inst.id)}
                className={`w-full rounded-xl border px-4 py-3 text-center cursor-pointer transition-colors focus:outline-none ${
                  isActive
                    ? "border-primary bg-(--primary-dim)"
                    : "border-(--line) bg-(--bg-elev) hover:border-primary"
                }`}
              >
                <div className="text-[13px] font-medium text-(--ink) truncate">
                  {inst.displayName}
                </div>
                {inst.status !== null && (
                  <div className="mt-0.5">
                    <StatusBadge status={inst.status} label={inst.label} />
                  </div>
                )}
              </button>

              {/* Hover popup for subagent cards with input/output */}
              {hasPopup && isHovered && (
                <HoverPopup input={inst.input} output={inst.output} />
              )}
            </div>

            {/* Connector arrow */}
            {!isLast && (
              <ArrowDown size={16} className="text-(--ink-3) my-1.5 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}
