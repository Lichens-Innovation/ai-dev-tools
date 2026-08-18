import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  FolderOpen,
  Workflow,
  BookOpenCheck,
  ScrollText,
  ListChecks,
  Download,
  LayoutGrid,
  BookOpen,
  X,
} from "lucide-react";
import Button from "@repo/ui/button";
import { useProject } from "../utils/project-context";

export const Route = createFileRoute("/")({
  component: Home,
});

const SECTIONS = [
  { path: "/workflows", label: "Workflows", icon: Workflow, blurb: "Wire agents, skills, and handoffs into a graph." },
  {
    path: "/rules",
    label: "Rules",
    icon: BookOpenCheck,
    blurb: "Assign rule files to the project root or directories.",
  },
  {
    path: "/session-log",
    label: "Session Log",
    icon: ScrollText,
    blurb: "Live view of the running Claude Code session.",
  },
  { path: "/maestro-tasks", label: "Tasks", icon: ListChecks, blurb: "The queue /to-maestro-tasks wrote." },
  { path: "/install", label: "Runtime", icon: Download, blurb: "Install or update Maestro's hooks in this project." },
  { path: "/tools", label: "Tools", icon: LayoutGrid, blurb: "Installed plugins, CLI commands, marketplaces." },
  { path: "/docs", label: "Docs", icon: BookOpen, blurb: "Read and search the project's docs/." },
] as const;

/**
 * The landing page is a project picker, not a splash screen. The web app opened already scoped
 * to one repo — the container was launched per-project with that path bind-mounted, so there was
 * nothing to choose. A desktop app starts with no project at all.
 */
function Home() {
  const { current, recent, pick, open, forget } = useProject();
  const navigate = useNavigate();

  const openAndGo = async (root: string) => {
    await open(root);
    void navigate({ to: "/workflows" });
  };

  return (
    <div className="min-h-screen bg-(--bg) text-(--ink) flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="mb-1 text-2xl font-semibold">Maestro</h1>
        <p className="text-[13px] text-(--ink-3) m-0">
          {current ? (
            <>
              Open: <span className="font-mono text-(--ink-2)">{current.root}</span>
            </>
          ) : (
            "Choose a project to configure."
          )}
        </p>
      </div>

      <Button variant="primary" icon={<FolderOpen size={14} />} onClick={() => void pick()}>
        {current ? "Switch project…" : "Open project…"}
      </Button>

      {recent.length > 0 && (
        <div className="w-full max-w-md">
          <div className="text-[11px] font-semibold text-subtle uppercase tracking-wide mb-2">Recent</div>
          <ul className="flex flex-col gap-1 list-none p-0 m-0">
            {recent.map((r) => (
              <li key={r.root} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void openAndGo(r.root)}
                  className="flex-1 text-left px-3 py-2 rounded-md border border-(--line) bg-(--bg-elev) hover:border-(--ink-3) cursor-pointer focus:outline-none"
                >
                  <div className="text-[13px] text-(--ink)">{r.name}</div>
                  <div className="text-[11px] text-(--ink-3) font-mono truncate">{r.root}</div>
                </button>
                <button
                  type="button"
                  onClick={() => void forget(r.root)}
                  title="Remove from recent"
                  className="w-7 h-7 rounded-md flex items-center justify-center text-(--ink-3) hover:text-(--ink) cursor-pointer focus:outline-none"
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {current && (
        <div className="grid grid-cols-2 gap-3 w-full max-w-2xl">
          {SECTIONS.map(({ path, label, icon: Icon, blurb }) => (
            <Link
              key={path}
              to={path}
              className="flex flex-col gap-1 p-4 rounded-lg border border-(--line) bg-(--bg-elev) no-underline hover:border-(--ink-3)"
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold text-(--ink)">
                <Icon size={14} /> {label}
              </span>
              <span className="text-[12px] text-(--ink-3)">{blurb}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
