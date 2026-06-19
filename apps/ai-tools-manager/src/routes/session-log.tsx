import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { ScrollText } from "lucide-react";
import TopNav from "../components/top-nav";
import SessionLogCards from "../components/session-log-cards";
import SessionLogView from "../components/session-log-view";
import { useSessionLog } from "../utils/session-log-context";
import { buildInstances } from "../utils/session-log";

export const Route = createFileRoute("/session-log")({
  component: SessionLogPage,
});

function SessionLogPage() {
  const { entries, connected } = useSessionLog();
  const [activeId, setActiveId] = useState<number | null>(null);
  const sectionRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const instances = useMemo(() => buildInstances(entries), [entries]);

  const handleCardClick = (id: number) => {
    setActiveId(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const isEmpty = entries.length === 0;

  return (
    <div className="w-full h-screen bg-(--bg) font-sans text-(--ink) overflow-hidden flex flex-col">
      <TopNav />

      {isEmpty ? (
        /* Empty state */
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <div className="w-12 h-12 rounded-full bg-(--bg-elev) border border-(--line) flex items-center justify-center">
            <ScrollText size={20} className="text-(--ink-3)" />
          </div>
          <div>
            <p className="text-[13px] font-medium text-(--ink) mb-1">No session log found</p>
            <p className="text-[12px] text-(--ink-3) max-w-xs">
              The log appears while an AFK session is running and is cleared when it ends.
            </p>
          </div>
          {/* Live connection indicator in empty state */}
          <div className={`flex items-center gap-1.5 text-[11px] ${connected ? "text-(--green)" : "text-(--ink-3)"}`}>
            <span className="text-[8px]">{connected ? "●" : "○"}</span>
            {connected ? "live" : "connecting…"}
          </div>
        </div>
      ) : (
        /* Two-pane layout */
        <div
          className="flex-1 grid overflow-hidden"
          style={{ gridTemplateColumns: "360px 1fr" }}
        >
          <SessionLogCards
            instances={instances}
            activeId={activeId}
            onSelect={handleCardClick}
          />
          <SessionLogView
            instances={instances}
            activeId={activeId}
            sectionRefs={sectionRefs}
            connected={connected}
          />
        </div>
      )}
    </div>
  );
}
