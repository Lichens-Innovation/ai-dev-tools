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
  Check,
  Eye,
  Info,
  MessagesSquare,
  Play,
  Send,
  ShieldQuestion,
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
import type { PermissionChoice, PermissionDetail, PermissionOutcome, PermissionPrompt } from "../../../shared/ipc";

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
                : session.pending.length > 0
                  ? `Waiting on you · ${session.pending.length} request${session.pending.length === 1 ? "" : "s"}`
                  : session.live
                    ? `Live in ${current.name} · asks before it acts`
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
            This session's write scope is empty — nothing in the app can add a directory to it yet — so every Edit or
            Write is stopped and asked about instead. Allowing one lets that single call through; it grants nothing
            beyond it, and the next write asks again.
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
          <Entry key={entry.seq} entry={entry} cwd={current?.root ?? ""} outcomes={session.outcomes} />
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

      {/*
        PINNED, not inline. A parked tool call waits forever — permission prompts do not time out —
        so the question cannot be something the transcript scrolls away from. The pane also opens
        itself when one arrives (see `session-context.tsx`), which is what makes a prompt answerable
        from whatever route the user was on.
      */}
      {session.pending.length > 0 && (
        <div data-testid="session-permissions" className="border-t border-(--line) px-4 pt-3 shrink-0">
          {session.pending.map((request) => (
            <PermissionCard
              key={request.requestId}
              request={request}
              onAnswer={(choice) => void session.answer(request.requestId, choice)}
            />
          ))}
        </div>
      )}

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
          Enter to send. Every turn is yours — the app writes none of them, and anything outside what this session was
          given comes back to you as a question.
        </p>
      </div>
    </aside>
  );
}

/**
 * The default a denial carries when the user typed nothing.
 *
 * NOT `"denied"`. The model reads the refusal and adapts — that is measured behaviour, not hope —
 * so the message is the one channel there is for steering it, and an empty string throws it away.
 * The main process substitutes a sentence of its own if this ever fails to arrive, but the UI's job
 * is to not make it necessary.
 */
const DEFAULT_DENY_REASON = "The user declined this call. Do not retry it; say what you needed it for instead.";
const DEFAULT_STOP_REASON = "The user stopped this turn rather than allowing that call.";

/**
 * One tool call waiting on a person.
 *
 * PINNED ABOVE THE COMPOSER, not inline in the transcript, because a transcript scrolls and a
 * parked tool call does not time out. Rendered PER TOOL — a fetch shows its complete URL, a write
 * shows the path and what would change — for the reason a generic payload dump fails: it is
 * technically correct and practically useless, so it is answered with a reflexive Allow, which is
 * worse than never having asked because it looks like consent.
 */
function PermissionCard({
  request,
  onAnswer,
}: {
  request: PermissionPrompt;
  onAnswer(choice: PermissionChoice): void;
}) {
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(false);

  const answer = (choice: PermissionChoice) => {
    if (sent) return;
    setSent(true);
    onAnswer(choice);
  };

  // The reason is resolved HERE, so nothing empty is ever sent — see DEFAULT_DENY_REASON. The
  // fallback for a plain Deny is the ENGINE's own sentence when it had one: `decideWrite`'s refusal
  // is written to steer the model back to useful work, and a generic "the user declined" throws
  // that away for no gain.
  const reasonOr = (fallback: string): string => (reason.trim() === "" ? fallback : reason.trim());

  return (
    <div
      data-testid="session-permission"
      data-request={request.requestId}
      data-tool={request.tool}
      className="mb-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2.5"
    >
      <div className="flex items-start gap-2">
        <ShieldQuestion size={14} className="mt-0.5 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[12px] font-semibold text-(--ink)">
            {request.title ?? `Claude wants to use ${request.tool}`}
          </p>
          {/* Which agent asked. Absent for the session itself, and never guessed. */}
          {request.agentId && <p className="m-0 text-[10px] text-(--ink-3)">Asked by subagent {request.agentId}</p>}
        </div>
      </div>

      <PermissionDetailView detail={request.detail} />

      <p data-testid="session-permission-reason" className="m-0 mt-2 text-[11px] text-(--ink-2)">
        {request.reason}
      </p>
      {request.decisionReason && request.decisionReason !== request.reason && (
        <p className="m-0 mt-1 text-[10px] text-(--ink-3)">Claude Code says: {request.decisionReason}</p>
      )}

      <input
        data-testid="session-permission-message"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why not? (sent to Claude, which reads it and adapts)"
        className="mt-2 w-full rounded-md border border-(--line) bg-(--bg) px-2 py-1.5 text-[11px] text-(--ink) placeholder-subtle outline-none focus:border-primary"
      />

      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          data-testid="session-permission-allow"
          disabled={sent}
          onClick={() => answer({ choice: "allow" })}
          className="inline-flex items-center gap-1 rounded-md border-0 bg-primary px-2.5 py-1 text-[11px] text-white hover:brightness-110 disabled:opacity-40 cursor-pointer focus:outline-none"
        >
          <Check size={11} /> Allow once
        </button>
        <button
          type="button"
          data-testid="session-permission-deny"
          disabled={sent}
          onClick={() => answer({ choice: "deny", reason: reasonOr(request.denyReason || DEFAULT_DENY_REASON) })}
          className="inline-flex items-center gap-1 rounded-md border border-(--line) bg-(--bg) px-2.5 py-1 text-[11px] text-(--ink-2) hover:text-(--ink) disabled:opacity-40 cursor-pointer focus:outline-none"
        >
          <Ban size={11} /> Deny
        </button>
        {/*
          STOP IS NOT DENY. A plain denial refuses the call and lets the model try something else —
          it usually finishes the job anyway. Stopping ends the turn. Collapsing the two picks one
          of those on the user's behalf, and they are not the same intent.
        */}
        <button
          type="button"
          data-testid="session-permission-stop"
          disabled={sent}
          onClick={() => answer({ choice: "stop", reason: reasonOr(DEFAULT_STOP_REASON) })}
          title="Refuse this call and end the turn"
          className="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[11px] text-red-500 hover:bg-red-500/20 disabled:opacity-40 cursor-pointer focus:outline-none"
        >
          <Square size={9} /> Stop turn
        </button>
      </div>
    </div>
  );
}

/** The per-tool body of a prompt. Every branch renders FIELDS, never the raw input object. */
function PermissionDetailView({ detail }: { detail: PermissionDetail }) {
  const box = "mt-2 rounded-md border border-(--line) bg-(--bg) px-2 py-1.5 font-mono text-[10px] break-all";

  if (detail.kind === "fetch") {
    return (
      <div>
        {/*
          THE COMPLETE URL — query string included, never elided to a hostname. This session can read
          the user's project, and an outbound request is how the contents of it leave; `example.com`
          and `example.com/c?body=<their file>` are the same prompt if the path is hidden.
        */}
        <div data-testid="session-permission-url" className={`${box} text-(--ink)`}>
          {detail.url}
        </div>
        {detail.prompt && <p className="m-0 mt-1 text-[10px] text-(--ink-3)">Asking it: {detail.prompt}</p>}
      </div>
    );
  }

  if (detail.kind === "search") {
    return (
      <div data-testid="session-permission-query" className={`${box} text-(--ink)`}>
        {detail.query}
      </div>
    );
  }

  if (detail.kind === "write") {
    return (
      <div>
        <div data-testid="session-permission-path" className={`${box} text-(--ink)`}>
          {detail.path || "(no path given)"}
        </div>
        {detail.diff && (
          <div data-testid="session-permission-diff" className="mt-1.5 flex flex-col gap-1">
            {detail.diff.hunks.map((hunk, i) => (
              <div key={i} className="rounded-md border border-(--line) overflow-hidden">
                {hunk.before !== null && (
                  <pre className="m-0 max-h-24 overflow-auto bg-red-500/10 px-2 py-1 font-mono text-[10px] text-(--ink-2) whitespace-pre-wrap break-all">
                    {hunk.before}
                  </pre>
                )}
                <pre className="m-0 max-h-24 overflow-auto bg-green-500/10 px-2 py-1 font-mono text-[10px] text-(--ink-2) whitespace-pre-wrap break-all">
                  {hunk.after}
                </pre>
              </div>
            ))}
            {(detail.diff.more > 0 || detail.diff.clipped) && (
              <p className="m-0 text-[10px] text-(--ink-3)">
                {detail.diff.more > 0 && `${detail.diff.more} more change${detail.diff.more === 1 ? "" : "s"}. `}
                {detail.diff.clipped && "Shortened for display."}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  if (detail.kind === "read") {
    return (
      <div data-testid="session-permission-path" className={`${box} text-(--ink)`}>
        {detail.path || "(no path given)"}
      </div>
    );
  }

  if (detail.kind === "scan") {
    return (
      <div data-testid="session-permission-path" className={`${box} text-(--ink)`}>
        {detail.pattern ?? "*"}
        {detail.path && <span className="text-(--ink-3)"> in {detail.path}</span>}
      </div>
    );
  }

  return (
    <div data-testid="session-permission-summary" className={`${box} text-(--ink)`}>
      {detail.summary}
    </div>
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
            : "One conversation, per project, that can read this repository and your marketplaces. Anything else — a write, a fetch, a file outside them — it has to ask you about first."}
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

/** How a refusal names the component that decided. The SDK's discriminator rides along on `auto`. */
const REFUSED_BY: Record<TranscriptRefusal["source"], (decidedBy: string | null) => string> = {
  "write-scope": () => "refused by this app's write scope",
  "read-boundary": () => "refused by this session's read boundary",
  user: () => "you refused it",
  auto: (decidedBy) => `auto-denied${decidedBy ? ` by a ${decidedBy}` : " by the permission system"}`,
};

const OUTCOME_LABEL: Record<PermissionOutcome, string> = {
  allow: "you allowed it",
  deny: "you refused it",
  stop: "you stopped the turn",
  cancelled: "the session ended before it was answered, so it was refused",
};

type TranscriptRefusal = Extract<TranscriptEntry, { kind: "refusal" }>;

/** One transcript entry. The union is rendered per kind — a JSON blob per event would be useless. */
function Entry({
  entry,
  cwd,
  outcomes,
}: {
  entry: TranscriptEntry;
  cwd: string;
  outcomes: Record<string, PermissionOutcome>;
}) {
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
        data-source={entry.source}
        data-decided-by={entry.decidedBy ?? ""}
        className="mb-3 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px]"
      >
        <Ban size={12} className="shrink-0 mt-px text-amber-500" />
        <span className="text-(--ink-2) break-words">
          <span className="font-semibold">{entry.tool}</span>
          {entry.target && <span className="font-mono"> {entry.target}</span>} — {entry.reason}
          {/*
            WHO DECIDED, on every refusal. Four components can refuse a call and they reach this
            transcript by routes that share no code — this app's write scope, its read boundary, the
            user answering a prompt, and the SDK's own auto-denial event for deny RULES and MODE
            denials. "It was refused" without "by what" leaves the user with nothing to change.
          */}
          <span className="ml-1 text-(--ink-3)">({REFUSED_BY[entry.source](entry.decidedBy)})</span>
        </span>
      </div>
    );
  }

  if (entry.kind === "permission") {
    // The pending card lives above the composer, where it cannot be scrolled past. This is the
    // transcript's record that the question was asked, and how it ended.
    const outcome = outcomes[entry.request.requestId];
    return (
      <div
        data-testid="session-permission-entry"
        data-request={entry.request.requestId}
        data-outcome={outcome ?? "pending"}
        className="mb-3 flex items-start gap-1.5 text-[11px] text-(--ink-3)"
      >
        <ShieldQuestion size={11} className="shrink-0 mt-0.5" />
        <span className="break-words">
          Asked about <span className="font-semibold text-(--ink-2)">{entry.request.tool}</span>
          {entry.request.target && <span className="font-mono"> {entry.request.target}</span>} —{" "}
          {outcome ? OUTCOME_LABEL[outcome] : "waiting for you"}
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
