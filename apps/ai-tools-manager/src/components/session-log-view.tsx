import { humanizeLog } from "../utils/session-log";
import type { Instance } from "../utils/session-log";

interface SessionLogViewProps {
  instances: Instance[];
  activeId: number | null;
  sectionRefs: React.MutableRefObject<Record<number, HTMLDivElement | null>>;
  connected: boolean;
}

export default function SessionLogView({
  instances,
  activeId,
  sectionRefs,
  connected,
}: SessionLogViewProps) {
  return (
    <div className="flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-(--line) shrink-0">
        <span className="text-[13px] font-medium text-(--ink)">Logs</span>
        {/* Live connection indicator */}
        <div
          className={`flex items-center gap-1.5 text-[11px] ${
            connected ? "text-(--green)" : "text-(--ink-3)"
          }`}
        >
          <span className="text-[8px]">{connected ? "●" : "○"}</span>
          {connected ? "live" : "reconnecting…"}
        </div>
      </div>

      {/* Scrollable log body */}
      <div className="flex-1 overflow-y-auto px-6 py-4 font-mono text-xs leading-[1.7]">
        {instances.map((inst) => {
          const isActive = inst.id === activeId;
          const lines = inst.entries
            .map((e) => humanizeLog(e))
            .filter((line): line is string => line !== null);

          return (
            <div
              key={inst.id}
              ref={(el) => {
                sectionRefs.current[inst.id] = el;
              }}
              className={`scroll-mt-4 mb-4 ${isActive ? "bg-(--primary-dim) rounded-md px-2 -mx-2" : ""}`}
            >
              {/* Section label */}
              <div className="text-(--ink-3) text-[10px] font-semibold uppercase tracking-wider py-1 mb-0.5">
                {inst.displayName}
              </div>

              {lines.length > 0 ? (
                lines.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap break-words text-(--ink-2)">
                    -{" "}
                    {inst.origin === "main_session"
                      ? line
                      : `[${inst.displayName}]: ${line}`}
                  </div>
                ))
              ) : (
                <div className="text-(--ink-3) italic">no tool calls recorded</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
