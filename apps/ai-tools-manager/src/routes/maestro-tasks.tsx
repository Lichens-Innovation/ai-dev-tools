import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ListChecks, Copy, CircleCheck, CircleDot, CircleDashed } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CopyableText from "@repo/ui/copyable-text";
import TopNav from "../components/top-nav";
import { getMaestroTasks, type MaestroTask, type TaskStatus } from "../utils/maestro-tasks";

export const Route = createFileRoute("/maestro-tasks")({
  loader: async () => ({ tasks: await getMaestroTasks() }),
  component: MaestroTasksPage,
});

function promptFor(task: MaestroTask): string {
  return `Use /maestro to complete the task described in file ${task.relativePath}`;
}

type Filter = "open" | "closed";
const isOpen = (t: MaestroTask) => t.status !== "done";

const STATUS_META: Record<TaskStatus, { Icon: typeof CircleCheck; cls: string; label: string }> = {
  done: { Icon: CircleCheck, cls: "text-emerald-500", label: "Done" },
  ready: { Icon: CircleDot, cls: "text-sky-500", label: "Ready" },
  blocked: { Icon: CircleDashed, cls: "text-(--ink-3)", label: "Blocked" },
};

function StatusBadge({ status }: { status: TaskStatus }) {
  const { Icon, cls, label } = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${cls}`} title={label}>
      <Icon size={12} /> {label}
    </span>
  );
}

function MaestroTasksPage() {
  const { tasks } = Route.useLoaderData();
  const [filter, setFilter] = useState<Filter>("open");
  const [activeFile, setActiveFile] = useState<string | null>(null);

  const openCount = useMemo(() => tasks.filter(isOpen).length, [tasks]);
  const closedCount = tasks.length - openCount;

  const visible = useMemo(
    () => tasks.filter((t) => (filter === "open" ? isOpen(t) : !isOpen(t))),
    [tasks, filter]
  );

  // Keep a valid selection within the current filter; default to the first row.
  const active = visible.find((t) => t.filename === activeFile) ?? visible[0];

  const isEmpty = tasks.length === 0;

  return (
    <div className="w-full h-screen bg-(--bg) font-sans text-(--ink) overflow-hidden flex flex-col">
      <TopNav />

      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <div className="w-12 h-12 rounded-full bg-(--bg-elev) border border-(--line) flex items-center justify-center">
            <ListChecks size={20} className="text-(--ink-3)" />
          </div>
          <div>
            <p className="text-[13px] font-medium text-(--ink) mb-1">No Maestro tasks found</p>
            <p className="text-[12px] text-(--ink-3) max-w-xs">
              Run <span className="font-mono">/to-maestro-tasks</span> to break a plan into task files
              under <span className="font-mono">.claude/maestro-tasks/</span>.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 grid overflow-hidden" style={{ gridTemplateColumns: "320px 1fr" }}>
          {/* Left — task list */}
          <aside className="border-r border-(--line) overflow-y-auto p-3 flex flex-col gap-1.5">
            {/* Open / Closed filter */}
            <div className="flex gap-1 p-0.5 mb-1 rounded-lg bg-(--bg-elev) border border-(--line)">
              {(["open", "closed"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium capitalize cursor-pointer transition-colors ${
                    filter === f ? "bg-(--primary-dim) text-(--ink)" : "text-(--ink-3) hover:text-(--ink)"
                  }`}
                >
                  {f} ({f === "open" ? openCount : closedCount})
                </button>
              ))}
            </div>

            {visible.length === 0 ? (
              <div className="text-[12px] text-(--ink-3) px-1 py-4 text-center">
                No {filter} tasks.
              </div>
            ) : (
              visible.map((task) => (
                <button
                  key={task.filename}
                  type="button"
                  onClick={() => setActiveFile(task.filename)}
                  className={`text-left rounded-lg border px-3 py-2 cursor-pointer focus:outline-none transition-colors ${
                    active?.filename === task.filename
                      ? "border-primary bg-(--primary-dim)"
                      : "border-(--line) bg-(--bg-elev) hover:border-primary"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono text-[10px] text-(--ink-3) truncate">{task.filename}</div>
                    <StatusBadge status={task.status} />
                  </div>
                  <div className="text-[13px] text-(--ink) leading-snug mt-0.5">{task.title}</div>
                  {task.blockedBy.length > 0 && task.status !== "done" && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {task.blockedBy.map((b) => (
                        <span
                          key={b}
                          title={`Blocked by ${b}`}
                          className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-(--bg-3) text-(--ink-3) border border-(--line)"
                        >
                          ⛔ {b}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))
            )}
          </aside>

          {/* Right — selected task */}
          <main className="overflow-y-auto">
            {active && (
              <div className="max-w-3xl mx-auto px-6 py-6">
                {/* Copy-prompt header */}
                <div className="flex items-center justify-between gap-3 mb-5 pb-4 border-b border-(--line)">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-mono text-[11px] text-(--ink-3) truncate">
                        {active.relativePath}
                      </div>
                      <StatusBadge status={active.status} />
                    </div>
                    <h2 className="text-[16px] font-semibold text-(--ink) mt-0.5 truncate">
                      {active.title}
                    </h2>
                  </div>
                  <CopyableText
                    text={promptFor(active)}
                    copiedText="Prompt copied!"
                    previewText="Copy prompt for Claude Code"
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-primary bg-(--primary-dim) px-3 py-1.5 text-[12px] font-medium text-(--ink) hover:brightness-110"
                  >
                    <Copy size={13} /> Copy prompt
                  </CopyableText>
                </div>

                <div className="prose prose-neutral max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{active.content}</ReactMarkdown>
                </div>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
