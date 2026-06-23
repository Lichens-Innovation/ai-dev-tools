import { Link } from "@tanstack/react-router";
import ThemeToggle from "@repo/ui/theme-toggle";
import { Workflow, BookOpenCheck, ScrollText, ListChecks, Plus, X, Pencil, Check, ChevronDown, Trash2, CircleStop } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useSessionLog } from "../utils/session-log-context";
import { shutdownAppSession } from "../utils/ai-tools-session";

interface WorkflowSelectorProps {
  workflows: string[];
  activeIndex: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onRename: (i: number, name: string) => void;
}

export default function TopNav({
  workflowSelector,
}: {
  workflowSelector?: WorkflowSelectorProps;
}) {
  const { connected } = useSessionLog();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [stopped, setStopped] = useState(false);

  const handleStop = async () => {
    try {
      await shutdownAppSession();
    } catch {
      // best-effort; the listen-loop also ends on Esc / SessionEnd
    }
    setStopped(true);
  };

  // Reset editing + close menu when active workflow changes
  useEffect(() => { setEditing(false); setMenuOpen(false); }, [workflowSelector?.activeIndex]);

  // Close the dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as globalThis.Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Dismiss the delete-confirmation modal on Escape
  useEffect(() => {
    if (pendingDelete === null) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setPendingDelete(null); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [pendingDelete]);

  const confirmDelete = () => {
    if (pendingDelete === null || !workflowSelector) return;
    workflowSelector.onRemove(pendingDelete);
    setPendingDelete(null);
  };

  const startEdit = () => {
    if (!workflowSelector) return;
    setEditValue(workflowSelector.workflows[workflowSelector.activeIndex] ?? "");
    setEditing(true);
    setTimeout(() => editInputRef.current?.select(), 0);
  };

  const confirmEdit = () => {
    if (!workflowSelector) return;
    workflowSelector.onRename(workflowSelector.activeIndex, editValue.trim() || `Workflow ${workflowSelector.activeIndex + 1}`);
    setEditing(false);
  };

  const cancelEdit = () => setEditing(false);

  return (
    <nav className="h-11 border-b border-(--line) bg-(--bg) flex items-center px-4 gap-1 shrink-0">
      <Link
        to="/workflows"
        activeProps={{ className: "text-(--ink) bg-(--bg-elev)" }}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[13px] text-(--ink-2) hover:text-(--ink)"
      >
        <Workflow size={13} /> Workflows
      </Link>
      <Link
        to="/rules"
        activeProps={{ className: "text-(--ink) bg-(--bg-elev)" }}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[13px] text-(--ink-2) hover:text-(--ink)"
      >
        <BookOpenCheck size={13} /> Rules
      </Link>
      <Link
        to="/session-log"
        activeProps={{ className: "text-(--ink) bg-(--bg-elev)" }}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[13px] text-(--ink-2) hover:text-(--ink)"
      >
        <ScrollText size={13} /> Session Log
        <span
          title={connected ? "Live" : "Connecting…"}
          className={`text-[7px] leading-none ${connected ? "text-(--green)" : "text-(--ink-3)"}`}
        >
          ●
        </span>
      </Link>
      <Link
        to="/maestro-tasks"
        activeProps={{ className: "text-(--ink) bg-(--bg-elev)" }}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[13px] text-(--ink-2) hover:text-(--ink)"
      >
        <ListChecks size={13} /> Maestro Tasks
      </Link>

      {/* Centered workflow selector */}
      <div className="flex-1 flex items-center justify-center">
        {workflowSelector && (
          <div className="flex items-center gap-1">
            {editing ? (
              <>
                <input
                  ref={editInputRef}
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmEdit(); if (e.key === "Escape") cancelEdit(); }}
                  className="h-7 px-2.5 rounded-md text-[13px] bg-(--bg-elev) border border-primary text-(--ink) focus:outline-none w-44"
                />
                <button type="button" onClick={confirmEdit} title="Confirm" className="w-7 h-7 rounded-md flex items-center justify-center bg-(--bg-elev) border border-(--line) text-primary hover:bg-(--primary-dim) cursor-pointer focus:outline-none">
                  <Check size={13} />
                </button>
                <button type="button" onClick={cancelEdit} title="Cancel" className="w-7 h-7 rounded-md flex items-center justify-center bg-(--bg-elev) border border-(--line) text-(--ink-2) hover:text-(--ink) cursor-pointer focus:outline-none">
                  <X size={13} />
                </button>
              </>
            ) : (
              <>
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setMenuOpen((v) => !v)}
                    title="Switch workflow"
                    className="h-7 pl-2.5 pr-2 min-w-[20em] rounded-md text-[13px] bg-(--bg-elev) border border-(--line) text-(--ink) cursor-pointer focus:outline-none hover:border-primary flex items-center justify-between gap-2"
                  >
                    <span className="truncate">
                      {workflowSelector.workflows.length === 0
                        ? "No workflows"
                        : workflowSelector.workflows[workflowSelector.activeIndex] || `Workflow ${workflowSelector.activeIndex + 1}`}
                    </span>
                    <ChevronDown size={13} className="text-(--ink-3) shrink-0" />
                  </button>

                  {menuOpen && (
                    <div className="absolute left-0 top-9 z-50 w-full bg-(--bg) border border-(--line) rounded-lg shadow-lg py-1">
                      <div className="max-h-72 overflow-y-auto">
                        {workflowSelector.workflows.length === 0 && (
                          <div className="px-3 py-1.5 text-[12px] text-subtle">No workflows yet</div>
                        )}
                        {workflowSelector.workflows.map((name, i) => (
                          <div
                            key={i}
                            onClick={() => { workflowSelector.onSelect(i); setMenuOpen(false); }}
                            className={`group flex items-center justify-between gap-2 pl-3 pr-1.5 py-1.5 cursor-pointer hover:bg-(--bg-elev) ${
                              i === workflowSelector.activeIndex ? "text-(--ink)" : "text-(--ink-2)"
                            }`}
                          >
                            <span className="flex items-center gap-1.5 truncate text-[13px]">
                              {i === workflowSelector.activeIndex && <Check size={12} className="text-primary shrink-0" />}
                              <span className="truncate">{name || `Workflow ${i + 1}`}</span>
                            </span>
                            <button
                              type="button"
                              title="Delete workflow"
                              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setPendingDelete(i); }}
                              className="w-6 h-6 rounded flex items-center justify-center text-(--ink-3) hover:text-red-500 opacity-0 group-hover:opacity-100 cursor-pointer focus:outline-none shrink-0"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-(--line) mt-1 pt-1">
                        <button
                          type="button"
                          onClick={() => { workflowSelector.onAdd(); setMenuOpen(false); }}
                          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-(--ink-2) hover:bg-(--bg-elev) hover:text-(--ink) cursor-pointer focus:outline-none"
                        >
                          <Plus size={13} /> Add workflow
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {workflowSelector.workflows.length > 0 && (
                  <button type="button" onClick={startEdit} title="Rename workflow" className="w-7 h-7 rounded-md flex items-center justify-center bg-(--bg-elev) border border-(--line) text-(--ink-2) hover:text-(--ink) cursor-pointer focus:outline-none">
                    <Pencil size={12} />
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleStop}
        disabled={stopped}
        title={stopped ? "Session stopped — you can close this tab" : "Stop the Maestro app session (the dispatcher stops listening)"}
        className={`flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] border cursor-pointer focus:outline-none ${
          stopped
            ? "bg-(--bg-elev) border-(--line) text-(--ink-3) cursor-default"
            : "bg-(--bg-elev) border-(--line) text-(--ink-2) hover:text-red-500 hover:border-red-500"
        }`}
      >
        <CircleStop size={13} /> {stopped ? "Stopped" : "Stop"}
      </button>
      <ThemeToggle />

      {/* Delete-confirmation modal */}
      {pendingDelete !== null && workflowSelector && (
        <div
          className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="bg-(--bg) border border-(--line) rounded-xl p-5 shadow-xl w-80 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[13px] font-semibold text-(--ink)">Delete workflow</div>
            <p className="text-[12px] text-(--ink-2) m-0">
              Delete{" "}
              <span className="font-mono text-(--ink)">
                {workflowSelector.workflows[pendingDelete] || `Workflow ${pendingDelete + 1}`}
              </span>
              ? This can&apos;t be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="px-3 py-1.5 text-[12px] rounded-lg bg-(--bg-elev) border border-(--line) text-(--ink-2) hover:text-(--ink) cursor-pointer focus:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                onClick={confirmDelete}
                className="px-3 py-1.5 text-[12px] rounded-lg bg-red-500 text-white cursor-pointer focus:outline-none hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
