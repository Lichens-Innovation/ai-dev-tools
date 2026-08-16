// The session pane's state — the transcript, the pane's geometry, and the one path to `session:*`.
//
// WHY THIS IS A PROVIDER AND NOT COMPONENT STATE. `TopNav` renders per route, and the pane's toggle
// lives on it. A transcript held in the panel would be discarded the moment the user opened another
// route to look something up — and worse, the session id is the only handle on a turn in flight, so
// losing it leaves Claude running with no Stop to press. This is the same lesson the help chat's
// `ChatProvider` recorded before this replaced it (`CLAUDE.md:407`), applied to a surface where the
// state is now a live session in another process rather than a list of strings.
//
// WHAT IT IS ALLOWED TO SEND. `session:say` with the user's text, and nothing else. This module
// composes no prompt, prepends no instructions and appends no history — main stamps each turn as
// human-authored at the SDK boundary, which is only meaningful if what arrives there is what the
// user typed. That is the pane's version of the bridge's invariant, and `test/isolation.test.ts`
// pins the call site here and the absence of any other one.
//
// SINGLE-OWNER SUBSCRIBER, like `SessionLogProvider`. Main keys one session per `webContents.id`,
// so a second subscriber would be reading another owner's transcript.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { callMain } from "./call-main";
import { useProject } from "./project-context";
import type {
  PermissionChoice,
  PermissionOutcome,
  PermissionPrompt,
  SessionEvent,
  SessionInfo,
} from "../../../shared/ipc";

/** One entry in the transcript. User turns are local; everything else arrives as a `SessionEvent`. */
export type TranscriptEntry =
  | { seq: number; kind: "user"; text: string }
  | Extract<SessionEvent, { kind: "assistant" }>
  | Extract<SessionEvent, { kind: "tool" }>
  | Extract<SessionEvent, { kind: "refusal" }>
  | Extract<SessionEvent, { kind: "permission" }>
  | Extract<SessionEvent, { kind: "notice" }>
  | Extract<SessionEvent, { kind: "turn" }>
  | Extract<SessionEvent, { kind: "ended" }>;

interface SessionContextValue {
  open: boolean;
  setOpen(open: boolean): void;
  /** Pane width in px. The pane SHIFTS the layout, so this is a real column, not an overlay. */
  width: number;
  setWidth(width: number): void;
  /** What the session can see and do — null until main has been asked. */
  info: SessionInfo | null;
  entries: TranscriptEntry[];
  /** A session is live and can take a turn. */
  live: boolean;
  /** A turn is in flight: Stop is available, Send is not. */
  busy: boolean;
  /**
   * Tool calls waiting on an answer, oldest first.
   *
   * Held here rather than in the pane for the reason the transcript is: this provider is mounted in
   * `__root.tsx`, so a prompt survives navigation and is answerable from whatever route the user
   * happens to be on. A prompt held in a route would be a wedged session the moment they moved.
   */
  pending: PermissionPrompt[];
  /** How each answered request ended, so the transcript entry can say which way it went. */
  outcomes: Record<string, PermissionOutcome>;
  starting: boolean;
  error: string | null;
  /** Start a session against the open project. Nothing starts implicitly — the user asks. */
  start(): Promise<void>;
  /** Send one turn, exactly as typed. Starts a session first if there is none. */
  say(text: string): Promise<void>;
  /** Answer one parked request. A choice crosses the wire; main builds the permission result. */
  answer(requestId: string, choice: PermissionChoice): Promise<void>;
  /**
   * Take back a directory granted earlier in this session.
   *
   * The only call in this module that names a path, and it can only narrow: main matches it against
   * the grants it is holding. A grant goes the other way — `answer` sends a scope word and main
   * resolves the path from the prompt it asked.
   */
  revoke(path: string): Promise<void>;
  /** Interrupt the turn in flight, leaving the session usable. */
  stop(): Promise<void>;
  /** End the session and clear the transcript. */
  end(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** Pane width bounds. Narrow enough to keep a route usable, wide enough to read a code block in. */
export const MIN_PANE_WIDTH = 320;
export const MAX_PANE_WIDTH = 900;
const DEFAULT_PANE_WIDTH = 460;

/** User turns get their own descending sequence, so they cannot collide with main's ascending one. */
let userSeq = 0;

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(DEFAULT_PANE_WIDTH);
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PermissionPrompt[]>([]);
  const [outcomes, setOutcomes] = useState<Record<string, PermissionOutcome>>({});

  /** The live session id. A ref as well as state because `say` must not close over a stale one. */
  const sessionId = useRef<string | null>(null);
  const [live, setLive] = useState(false);

  const { current } = useProject();
  const projectRoot = current?.root ?? "";

  const append = useCallback((entry: TranscriptEntry) => setEntries((prev) => [...prev, entry]), []);

  // THE SINGLE SUBSCRIPTION. Mounted once, for the life of the window.
  useEffect(() => {
    return window.maestro.session.subscribe((event) => {
      if (event.kind === "permission-resolved") {
        // Not a transcript entry: it is the state of one that is already there. The prompt card
        // renders its outcome from this rather than from what the user clicked, so a request the
        // session resolved on its own — a window closing, a project switch — stops asking too.
        setPending((prev) => prev.filter((p) => p.requestId !== event.requestId));
        setOutcomes((prev) => ({ ...prev, [event.requestId]: event.outcome }));
        return;
      }
      if (event.kind === "scope") {
        // NOT A TRANSCRIPT ENTRY: it is the header's answer changing underneath it. The read scope
        // became mutable the moment a grant existed, and the disclosure has to follow the boundary
        // or the pane goes on describing a session that no longer exists. Main re-derives both from
        // one place; this only records what it sent.
        setInfo((prev) => (prev ? { ...prev, read: event.read, grants: event.grants } : prev));
        return;
      }
      append(event);
      if (event.kind === "permission") {
        // IMPOSSIBLE TO MISS. A prompt can arrive while the user is reading the docs three routes
        // away, and a tool call parked behind a closed pane waits forever — there is no timeout
        // anywhere below this. Opening the pane is the whole of "answerable from wherever they are".
        setPending((prev) =>
          prev.some((p) => p.requestId === event.request.requestId) ? prev : [...prev, event.request]
        );
        setOpen(true);
      }
      if (event.kind === "turn") setBusy(false);
      if (event.kind === "ended") {
        sessionId.current = null;
        setLive(false);
        setBusy(false);
        if (event.error) setError(event.error);
      }
    });
  }, [append]);

  /**
   * A project switch ends the session — main does it, and this clears what described it.
   *
   * Nothing is started against the new project. That is a decision, not an omission: a session
   * costs the user's subscription, and opening a repository is not asking a question about it.
   */
  useEffect(() => {
    sessionId.current = null;
    setLive(false);
    setBusy(false);
    setEntries([]);
    setError(null);
    setInfo(null);
    setPending([]);
    setOutcomes({});
    if (!projectRoot) return;
    // What a session WOULD be able to see, so the header can disclose it before one exists.
    void callMain(() => window.maestro.session.info()).then((res) => {
      if (res.ok) setInfo(res.value);
    });
  }, [projectRoot]);

  const start = useCallback(async () => {
    if (!projectRoot || starting) return;
    setStarting(true);
    setError(null);
    try {
      const res = await callMain(() => window.maestro.session.start());
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setInfo(res.value);
      sessionId.current = res.value.id;
      setLive(res.value.id !== null);
      if (res.value.id === null) setError(res.value.unavailable);
    } finally {
      setStarting(false);
    }
  }, [projectRoot, starting]);

  const say = useCallback(
    async (text: string) => {
      const turn = text.trim();
      if (!turn || busy) return;

      if (!sessionId.current) {
        await start();
        if (!sessionId.current) return;
      }

      // Echoed locally rather than waiting for main to reflect it: the user has to see their own
      // turn land immediately, and main has no reason to send back a string it was just given.
      append({ seq: --userSeq, kind: "user", text: turn });
      setBusy(true);
      setError(null);

      const id = sessionId.current;
      const res = await callMain(() => window.maestro.session.say(id, turn));
      if (!res.ok || res.value === false) {
        setBusy(false);
        setError(res.ok ? "That session is no longer running — start a new one." : res.error);
      }
    },
    [append, busy, start]
  );

  /**
   * Answer one parked request.
   *
   * The optimistic removal is deliberate and is not the source of truth: main emits
   * `permission-resolved` for every request it settles, including the ones nobody clicked, and the
   * subscriber above is what records the outcome. This just stops the buttons being clickable twice
   * while the round trip is in flight.
   */
  const answer = useCallback(async (requestId: string, choice: PermissionChoice) => {
    const id = sessionId.current;
    if (!id) return;
    setPending((prev) => prev.filter((p) => p.requestId !== requestId));
    const res = await callMain(() => window.maestro.session.answer(id, requestId, choice));
    if (!res.ok) setError(res.error);
  }, []);

  const revoke = useCallback(async (target: string) => {
    const id = sessionId.current;
    if (!id) return;
    // No optimistic removal. Unlike a pending prompt — where the buttons have to stop being
    // clickable immediately — a grant's whole point is that the header and the boundary agree, so
    // the list is only ever redrawn from the `scope` event main sends after it has actually moved.
    const res = await callMain(() => window.maestro.session.revoke(id, target));
    if (!res.ok) setError(res.error);
  }, []);

  const stop = useCallback(async () => {
    const id = sessionId.current;
    if (!id) return;
    await callMain(() => window.maestro.session.stop(id));
    setBusy(false);
  }, []);

  const end = useCallback(async () => {
    await callMain(() => window.maestro.session.end());
    sessionId.current = null;
    setLive(false);
    setBusy(false);
    setEntries([]);
    setPending([]);
    setOutcomes({});
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      open,
      setOpen,
      width,
      setWidth,
      info,
      entries,
      live,
      busy,
      pending,
      outcomes,
      starting,
      error,
      start,
      say,
      answer,
      revoke,
      stop,
      end,
    }),
    [answer, busy, end, entries, error, info, live, open, outcomes, pending, revoke, say, start, starting, stop, width]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider> — it is mounted in __root.tsx.");
  return ctx;
}

export type { PermissionChoice, PermissionPrompt, SessionEvent, SessionInfo };
