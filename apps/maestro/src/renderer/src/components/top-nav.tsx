import { Link } from "@tanstack/react-router";
import ThemeToggle from "@repo/ui/theme-toggle";
import {
  Workflow,
  BookOpenCheck,
  ScrollText,
  ListChecks,
  Plus,
  X,
  Pencil,
  Check,
  ChevronDown,
  Trash2,
  FolderOpen,
  Download,
  Sparkles,
  Bot,
  Package,
  Store,
  LayoutGrid,
  BookOpen,
  Library,
  MessagesSquare,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useSession } from "../utils/session-context";
import { useSessionLog } from "../utils/session-log-context";
import { useProject } from "../utils/project-context";
import { installBadge, useInstall } from "../utils/install-context";

/**
 * THE BAR IS GROUPED, NOT APPENDED TO.
 *
 * Before help-server was folded in, this was five top-level links (Workflows, Rules, Session Log,
 * Maestro Tasks, Runtime) plus a Create menu, a 20em workflow selector, the project button and the
 * theme toggle — already at the width of the app's 960px minimum. Hanging Tools and Docs off the
 * end would have overflowed it, and the first thing to fall off the end is the Runtime badge,
 * which is the one item here nobody goes looking for.
 *
 * So the bar now says what kind of thing each item is. The four project links stay top-level —
 * they are what a user came to the app to do, and they all write. Everything that only READS —
 * help-server's dashboard, the docs, and the runtime page — is one **Library** menu, which is a
 * net REDUCTION in top-level items even after adding two sections. The runtime badge is promoted
 * onto that menu's button so a stale runtime is still visible from whatever route the user is on.
 */
const LIBRARY_ROUTES = [
  { to: "/tools", label: "Tools", Icon: LayoutGrid },
  { to: "/docs", label: "Docs", Icon: BookOpen },
  { to: "/install", label: "Runtime", Icon: Download },
] as const;

const CREATE_ROUTES = [
  { to: "/create-skill", label: "Skill", Icon: Sparkles },
  { to: "/create-subagent", label: "Subagent", Icon: Bot },
  { to: "/create-plugin", label: "Plugin", Icon: Package },
  { to: "/create-marketplace", label: "Marketplace", Icon: Store },
] as const;

const NAV_LINK = "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[13px] text-(--ink-2) hover:text-(--ink)";
const MENU_ITEM =
  "flex items-center gap-2 px-3 py-1.5 text-[13px] text-(--ink-2) hover:bg-(--bg-elev) hover:text-(--ink)";

/** Close on an outside click — shared by both menus and by the workflow selector's own copy. */
function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, close]);
  return ref;
}

/** One dropdown of routes. Two of them now, so the behaviour is written once. */
function NavMenu({
  label,
  Icon,
  testId,
  routes,
  children,
}: {
  label: string;
  Icon: typeof Plus;
  testId: string;
  routes: readonly { to: string; label: string; Icon: typeof Plus }[];
  /** Rendered on the button, after the label — the Library menu's runtime badge. */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        data-testid={testId}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[13px] text-(--ink-2) hover:text-(--ink) cursor-pointer focus:outline-none bg-transparent border-0"
      >
        <Icon size={13} /> {label}
        {children}
        <ChevronDown size={12} className="text-(--ink-3)" />
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-50 w-44 bg-(--bg) border border-(--line) rounded-lg shadow-lg py-1">
          {routes.map(({ to, label: itemLabel, Icon: ItemIcon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              activeProps={{ className: "text-(--ink) bg-(--bg-elev)" }}
              className={MENU_ITEM}
            >
              <ItemIcon size={13} /> {itemLabel}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

interface WorkflowSelectorProps {
  workflows: string[];
  activeIndex: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onRename: (i: number, name: string) => void;
}

export default function TopNav({ workflowSelector }: { workflowSelector?: WorkflowSelectorProps }) {
  const { connected } = useSessionLog();
  const badge = installBadge(useInstall().status);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  // Not local state: the session outlives this component, which remounts on every navigation.
  const session = useSession();
  const { current, pick } = useProject();

  // Reset editing + close menu when active workflow changes
  useEffect(() => {
    setEditing(false);
    setMenuOpen(false);
  }, [workflowSelector?.activeIndex]);

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
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPendingDelete(null);
    };
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
    workflowSelector.onRename(
      workflowSelector.activeIndex,
      editValue.trim() || `Workflow ${workflowSelector.activeIndex + 1}`
    );
    setEditing(false);
  };

  const cancelEdit = () => setEditing(false);

  return (
    <nav className="h-11 border-b border-(--line) bg-(--bg) flex items-center px-4 gap-1 shrink-0">
      <Link to="/workflows" activeProps={{ className: "text-(--ink) bg-(--bg-elev)" }} className={NAV_LINK}>
        <Workflow size={13} /> Workflows
      </Link>
      <Link to="/rules" activeProps={{ className: "text-(--ink) bg-(--bg-elev)" }} className={NAV_LINK}>
        <BookOpenCheck size={13} /> Rules
      </Link>
      <Link to="/session-log" activeProps={{ className: "text-(--ink) bg-(--bg-elev)" }} className={NAV_LINK}>
        <ScrollText size={13} /> Session Log
        <span
          title={connected ? "Live" : "Connecting…"}
          className={`text-[7px] leading-none ${connected ? "text-(--green)" : "text-(--ink-3)"}`}
        >
          ●
        </span>
      </Link>
      <Link to="/maestro-tasks" activeProps={{ className: "text-(--ink) bg-(--bg-elev)" }} className={NAV_LINK}>
        <ListChecks size={13} /> Maestro Tasks
      </Link>

      {/* Where "what I'm editing" ends and "what I'm looking things up in" begins. */}
      <span className="w-px h-4 bg-(--line) mx-1.5 shrink-0" aria-hidden />

      {/*
        The read-only sections — help-server's dashboard, the docs, and the runtime page. The
        runtime BADGE rides on this button: a project running an older runtime than the app ships
        is precisely the thing a user never goes looking for, so it has to stay visible from
        whatever route they are already on, menu or not.
      */}
      <NavMenu label="Library" Icon={Library} testId="library-menu" routes={LIBRARY_ROUTES}>
        {badge !== "none" && (
          <span
            title={
              badge === "missing"
                ? "Maestro is not installed in this project"
                : "The app ships a newer runtime than this project has"
            }
            className="text-[7px] leading-none text-amber-500"
          >
            ●
          </span>
        )}
      </NavMenu>

      {/*
        The four create-* routes, behind one menu rather than four more top-level links: they are
        the things a user does occasionally, and four more items would push the runtime badge —
        which is the one thing here they never go looking for — off the end of a narrow window.
      */}
      <NavMenu label="Create" Icon={Plus} testId="create-menu" routes={CREATE_ROUTES} />

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
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmEdit();
                    if (e.key === "Escape") cancelEdit();
                  }}
                  className="h-7 px-2.5 rounded-md text-[13px] bg-(--bg-elev) border border-primary text-(--ink) focus:outline-none w-44"
                />
                <button
                  type="button"
                  onClick={confirmEdit}
                  title="Confirm"
                  className="w-7 h-7 rounded-md flex items-center justify-center bg-(--bg-elev) border border-(--line) text-primary hover:bg-(--primary-dim) cursor-pointer focus:outline-none"
                >
                  <Check size={13} />
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  title="Cancel"
                  className="w-7 h-7 rounded-md flex items-center justify-center bg-(--bg-elev) border border-(--line) text-(--ink-2) hover:text-(--ink) cursor-pointer focus:outline-none"
                >
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
                        : workflowSelector.workflows[workflowSelector.activeIndex] ||
                          `Workflow ${workflowSelector.activeIndex + 1}`}
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
                            onClick={() => {
                              workflowSelector.onSelect(i);
                              setMenuOpen(false);
                            }}
                            className={`group flex items-center justify-between gap-2 pl-3 pr-1.5 py-1.5 cursor-pointer hover:bg-(--bg-elev) ${
                              i === workflowSelector.activeIndex ? "text-(--ink)" : "text-(--ink-2)"
                            }`}
                          >
                            <span className="flex items-center gap-1.5 truncate text-[13px]">
                              {i === workflowSelector.activeIndex && (
                                <Check size={12} className="text-primary shrink-0" />
                              )}
                              <span className="truncate">{name || `Workflow ${i + 1}`}</span>
                            </span>
                            <button
                              type="button"
                              title="Delete workflow"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpen(false);
                                setPendingDelete(i);
                              }}
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
                          onClick={() => {
                            workflowSelector.onAdd();
                            setMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-(--ink-2) hover:bg-(--bg-elev) hover:text-(--ink) cursor-pointer focus:outline-none"
                        >
                          <Plus size={13} /> Add workflow
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {workflowSelector.workflows.length > 0 && (
                  <button
                    type="button"
                    onClick={startEdit}
                    title="Rename workflow"
                    className="w-7 h-7 rounded-md flex items-center justify-center bg-(--bg-elev) border border-(--line) text-(--ink-2) hover:text-(--ink) cursor-pointer focus:outline-none"
                  >
                    <Pencil size={12} />
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/*
        Where the web app's Stop button lived. That existed to tell the /ai-tools dispatcher to
        stop listening and tear the container down; a desktop app has neither, so the slot now
        shows which project is open and switches it.
      */}
      {/*
        The session toggle. The pane itself is rendered by `__root.tsx`, NOT here: it is a column
        beside the whole app rather than an overlay on one route, and this bar remounts on every
        navigation while the conversation must not. The dot marks a turn still running behind a
        closed pane, which is otherwise invisible.
      */}
      <button
        type="button"
        data-session-toggle
        onClick={() => session.setOpen(!session.open)}
        title={session.busy ? "Session — a turn is in progress" : "Session"}
        className="relative flex items-center justify-center w-7 h-7 rounded-md border bg-(--bg-elev) border-(--line) text-(--ink-2) hover:text-(--ink) cursor-pointer focus:outline-none"
      >
        <MessagesSquare size={13} />
        {session.busy && <span className="absolute -top-0.5 -right-0.5 text-[7px] leading-none text-(--green)">●</span>}
      </button>

      <button
        type="button"
        onClick={() => void pick()}
        title={current ? `Open project: ${current.root}` : "Choose a project folder"}
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] border bg-(--bg-elev) border-(--line) text-(--ink-2) hover:text-(--ink) cursor-pointer focus:outline-none max-w-[220px]"
      >
        <FolderOpen size={13} className="shrink-0" />
        <span className="truncate">{current?.name ?? "Open project…"}</span>
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
