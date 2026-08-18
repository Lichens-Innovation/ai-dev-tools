// The session pane — a live Claude conversation as a resizable right-hand COLUMN.
//
// A column, not a slide-over. The help chat this replaces was a `SlidePanel` floating above the
// route, which is right for something you consult and dismiss; a session you steer turn by turn is
// something you work BESIDE, and an overlay covering the thing you are asking about is the wrong
// shape for that. So the pane is rendered by `__root.tsx` as a sibling of the `Outlet` in a flex
// row, and the route it sits next to genuinely narrows. On the create-* routes it takes the
// FilePreview column outright (see `create-shell.tsx`): that column exists to show the file that
// will be generated, and once the conversation is open the artifact is already on disk.
//
// THIS FILE MAY NOT REACH `window.maestro.session`. Everything goes through `useSession()`, for the
// reason the chat panel had the same rule: a composer that "just sent one message to try it" is a
// second path to a model with none of the properties the first one has. `test/isolation.test.ts`
// asserts the absence here and the presence there.
//
// The transcript renders tool calls through `humanizeLog` — the SAME humanizer `/session-log` uses.
// What it does NOT reuse is `buildInstances`: that segments a hook-written JSONL file by origin and
// correlates dispatch↔handoff by `agent_id`, which is a different source with different shapes.
// Forcing a live SDK message stream through it would produce confident, wrong groupings.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Eye,
  Info,
  MessagesSquare,
  Play,
  Send,
  Square,
  Terminal,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import ReadScope from "./read-scope";
import { humanizeLog } from "../utils/session-log";
import { useProject } from "../utils/project-context";
import { useSession, MAX_PANE_WIDTH, MIN_PANE_WIDTH, type TranscriptEntry } from "../utils/session-context";

/** What to type in a Claude Code session to reach the same help the deleted chat asked for. */
const HELP_SKILL = "/super-help";

export default function SessionPane() {
  const session = useSession();
  const { current } = useProject();
  const [input, setInput] = useState("");
  const [showScope, setShowScope] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const noProject = !current;

  // Follow the tail as a turn streams in, the way a terminal does.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session.entries]);

  useEffect(() => {
    if (session.open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [session.open]);

  // Auto-grow the composer up to a few lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  if (!session.open) return null;

  const submit = () => {
    const text = input.trim();
    if (!text || session.busy || noProject) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    void session.say(text);
  };

  return (
    <aside
      data-testid="session-pane"
      style={{ width: session.width }}
      className="shrink-0 h-screen border-l border-(--line) bg-(--bg) flex flex-col relative"
    >
      <ResizeHandle width={session.width} onResize={session.setWidth} />

      <header className="flex items-center justify-between border-b border-(--line) px-4 py-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <MessagesSquare size={16} className="text-primary shrink-0" />
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-(--ink) m-0">Session</h2>
            <p data-testid="session-status" className="text-[10px] text-subtle m-0 truncate">
              {noProject
                ? "No project open"
                : session.live
                  ? `Live in ${current.name} · read-only`
                  : `Ready · ${current.name}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            data-testid="session-scope-toggle"
            onClick={() => setShowScope((v) => !v)}
            title="What this session can read and write"
            className="flex h-7 w-7 items-center justify-center rounded-md text-subtle hover:bg-(--bg-elev) hover:text-(--ink) bg-transparent border-0 cursor-pointer focus:outline-none"
          >
            <Eye size={14} />
          </button>
          {session.entries.length > 0 && (
            <button
              type="button"
              data-testid="session-clear"
              onClick={() => void session.end()}
              title="End this session and clear the transcript"
              className="flex h-7 w-7 items-center justify-center rounded-md text-subtle hover:bg-(--bg-elev) hover:text-(--ink) bg-transparent border-0 cursor-pointer focus:outline-none"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => session.setOpen(false)}
            aria-label="Close session pane"
            className="flex h-7 w-7 items-center justify-center rounded-md text-subtle hover:bg-(--bg-elev) hover:text-(--ink) bg-transparent border-0 cursor-pointer focus:outline-none"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      {/*
        THE SCOPE IS DISCLOSED, NOT IMPLIED, and by the same component the confirmation dialog uses.
        Reads never raise a prompt, so the directory list a session starts with is the whole bound
        on what the model can see — the reason `017` built this disclosure in the first place. The
        write half is said in WORDS because an empty list on screen says nothing at all.
      */}
      {showScope && session.info && (
        <div
          data-testid="session-scope"
          className="border-b border-(--line) bg-(--bg-elev) px-4 py-3 flex flex-col gap-2"
        >
          <ReadScope read={session.info.read} compact />
          <p data-testid="session-write-scope" className="m-0 text-[10px] text-(--ink-3)">
            This session cannot write anywhere. Its write scope is empty and nothing in the app can add to it yet, so
            every Edit or Write is refused with a reason it can act on. Ask it what to change, then use a form or your
            own editor.
          </p>
          <p className="m-0 text-[10px] text-(--ink-3)">
            Tools: <span className="font-mono text-(--ink-2)">{session.info.tools.join(", ")}</span>
          </p>
          <p className="m-0 text-[10px] text-(--ink-3)">
            Skills: <span className="font-mono text-(--ink-2)">{session.info.skills.join(", ")}</span>
          </p>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {session.entries.length === 0 && <EmptyState noProject={noProject} live={session.live} />}
        {session.entries.map((entry) => (
          <Entry key={entry.seq} entry={entry} cwd={current?.root ?? ""} />
        ))}
        {session.starting && (
          <div className="mb-3 text-[11px] text-(--ink-3)">Starting a session… (nothing has been asked yet)</div>
        )}
        {session.busy && (
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[11px] text-(--ink-3)">● working</span>
            <button
              type="button"
              data-testid="session-stop"
              onClick={() => void session.stop()}
              className="inline-flex items-center gap-1 rounded-md bg-red-500/10 border border-red-500/40 px-2 py-0.5 text-[10px] text-red-500 hover:bg-red-500/20 cursor-pointer focus:outline-none"
            >
              <Square size={9} /> Stop
            </button>
          </div>
        )}
        {session.error && (
          <div
            data-testid="session-error"
            className="mb-3 flex items-start gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11px]"
          >
            <AlertTriangle size={12} className="shrink-0 mt-px text-red-500" />
            <span className="text-(--ink-2) whitespace-pre-wrap break-words">{session.error}</span>
          </div>
        )}
      </div>

      <div className="border-t border-(--line) px-4 py-3 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            data-testid="session-input"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            disabled={noProject}
            placeholder={noProject ? "Open a project first…" : "Ask about this project…"}
            className="min-h-9 max-h-40 flex-1 resize-none rounded-md border border-(--line) bg-(--bg) px-3 py-2 text-[13px] text-(--ink) placeholder-subtle outline-none transition focus:border-primary disabled:opacity-50"
            style={{ lineHeight: "1.4" }}
          />
          <button
            type="button"
            data-testid="session-send"
            onClick={submit}
            disabled={!input.trim() || session.busy || noProject}
            aria-label="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-white transition hover:brightness-110 disabled:opacity-40 cursor-pointer focus:outline-none border-0"
          >
            <Send size={15} />
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-subtle m-0">
          Enter to send. Every turn is yours — the app writes none of them, and this session can read but not write.
        </p>
      </div>
    </aside>
  );
}

/**
 * The drag handle on the pane's LEFT edge.
 *
 * Pointer events on `window` rather than on the handle, because a fast drag leaves the 4px strip
 * long before the mouse button comes up and a handler bound to the element would then stop
 * receiving moves — the pane sticks halfway and the user has to try again.
 */
function ResizeHandle({ width, onResize }: { width: number; onResize(next: number): void }) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent) => {
      const next = window.innerWidth - e.clientX;
      onResize(Math.min(MAX_PANE_WIDTH, Math.max(MIN_PANE_WIDTH, next)));
    };
    const up = () => setDragging(false);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    // The cursor has to survive leaving the handle, or a drag looks like it has been dropped.
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, onResize]);

  return (
    <div
      data-testid="session-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize session pane"
      aria-valuenow={width}
      onMouseDown={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      className={`absolute left-0 top-0 h-full w-1 -ml-0.5 cursor-col-resize z-10 ${
        dragging ? "bg-primary" : "bg-transparent hover:bg-(--primary-dim)"
      }`}
    />
  );
}

function EmptyState({ noProject, live }: { noProject: boolean; live: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-(--primary-dim)">
        <MessagesSquare size={20} className="text-primary" />
      </div>
      <div>
        <p className="m-0 mb-1 text-[13px] font-medium text-(--ink)">
          {noProject ? "Open a project to start" : live ? "Ask anything about this project" : "Ask the first question"}
        </p>
        <p className="m-0 text-[12px] text-subtle max-w-[26rem]">
          {noProject
            ? "The session runs in the open project's directory, so it needs one."
            : "One conversation, per project, that can read this repository and your marketplaces. It cannot write anything."}
        </p>
      </div>
      <div className="w-full rounded-xl border border-(--line) bg-(--bg-elev) px-3.5 py-3 text-left">
        <p className="m-0 mb-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle">Also available here</p>
        <code className="inline-flex items-center gap-1.5 rounded-md border border-ring bg-(--primary-dim) px-2 py-1 font-mono text-[12px] text-primary">
          <Terminal size={11} /> {HELP_SKILL}
        </code>
        <p className="m-0 mt-1.5 text-[11px] text-(--ink-3)">
          The help skill the old chat panel ran, now a skill this session can reach by name.
        </p>
      </div>
    </div>
  );
}

/** One transcript entry. The union is rendered per kind — a JSON blob per event would be useless. */
function Entry({ entry, cwd }: { entry: TranscriptEntry; cwd: string }) {
  if (entry.kind === "user") {
    return (
      <div className="mb-3 flex justify-end" data-testid="session-turn" data-role="user">
        <div className="max-w-[85%] rounded-xl border border-ring bg-(--primary-dim) px-3.5 py-2.5 text-[13px] leading-relaxed text-(--ink) whitespace-pre-wrap break-words select-text">
          {entry.text}
        </div>
      </div>
    );
  }

  if (entry.kind === "assistant") {
    return (
      <div className="mb-3 flex" data-testid="session-turn" data-role="assistant">
        <div className="max-w-[95%] rounded-xl bg-(--bg-elev) px-3.5 py-2.5 text-[13px] leading-relaxed text-(--ink) whitespace-pre-wrap break-words select-text">
          {entry.text}
        </div>
      </div>
    );
  }

  if (entry.kind === "tool") {
    // The log view's humanizer, fed the same `Tool(arg)` shape the hooks write. Reused at the
    // humanize level and no higher — see the note at the top of this file.
    const label =
      humanizeLog({ ts: "", origin: "session", log: `${entry.tool}(${entry.target ?? ""})` }, cwd) ?? entry.tool;
    return (
      <div
        data-testid="session-tool"
        data-tool={entry.tool}
        className="mb-1.5 flex items-start gap-1.5 text-[11px] text-(--ink-3)"
      >
        <Wrench size={11} className="shrink-0 mt-0.5" />
        <span className="break-all">{label}</span>
      </div>
    );
  }

  if (entry.kind === "refusal") {
    return (
      <div
        data-testid="session-refusal"
        data-tool={entry.tool}
        className="mb-3 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px]"
      >
        <Ban size={12} className="shrink-0 mt-px text-amber-500" />
        <span className="text-(--ink-2) break-words">
          <span className="font-semibold">{entry.tool}</span>
          {entry.target && <span className="font-mono"> {entry.target}</span>} — {entry.reason}
        </span>
      </div>
    );
  }

  if (entry.kind === "notice") {
    return (
      <div data-testid="session-notice" className="mb-1.5 flex items-start gap-1.5 text-[11px] text-(--ink-3)">
        <Info size={11} className="shrink-0 mt-0.5" />
        <span className="whitespace-pre-wrap break-words">{entry.text}</span>
      </div>
    );
  }

  if (entry.kind === "turn") {
    if (entry.ok) return null;
    return (
      <div className="mb-3 flex items-start gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11px]">
        <AlertTriangle size={12} className="shrink-0 mt-px text-red-500" />
        <span className="text-(--ink-2)">{entry.error}</span>
      </div>
    );
  }

  return (
    <div data-testid="session-ended" className="mb-3 flex items-center gap-1.5 text-[11px] text-(--ink-3)">
      <Play size={11} className="shrink-0 rotate-90" />
      <span>{entry.error ? `Session ended: ${entry.error}` : "Session ended."}</span>
    </div>
  );
}
