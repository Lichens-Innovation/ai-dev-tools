// The help chat's session — transcript, confirmation policy, and the one path to the bridge.
//
// WHY THIS IS A PROVIDER AND NOT COMPONENT STATE. `TopNav` renders per route, so a chat living
// inside the panel would lose its transcript on every navigation, and — worse — a run in flight
// would lose the only thing that can stop it. Mounted once under the root route, the panel becomes
// a view of this and a user can read a doc while an answer streams in.
//
// WHAT IT IS ALLOWED TO DO. Exactly what every other surface in this app does: `claude.preview`
// with a REQUEST, then `claude.run` with the token that came back. help-server's chat did neither
// — it spawned `claude -p` from a server function, per message, with no preview and no
// confirmation, which is the second independently-grown spawn path the bridge exists to replace.
// There is deliberately no other way out of this module.
//
// THE CONFIRMATION OPT-OUT, AND ITS THREE CONSTRAINTS. A chat makes per-message confirmation feel
// heavier than it does in a one-shot form, so `askBeforeRun` can be turned off. It is only
// defensible because:
//
//   • it DEFAULTS TO ASKING — `useState(true)`, not "remember what they picked last time";
//   • it is scoped to this window's session and NOT PERSISTED — no localStorage, no settings file,
//     and it resets on a project switch below. Reopening the app asks again;
//   • it is visible and revocable from the panel header, in both states. An opt-out the user
//     cannot find again has not made the confirmation optional, it has removed it.
//
// With it off, the prompt is still recorded on the answer and shown under "Prompt sent" — turning
// the confirmation off is a choice not to be interrupted, not a choice to stop being told.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { callMain } from "./call-main";
import { useProject } from "./project-context";
import type { ChatTurn, ClaudePreview, ClaudeRunResult } from "../../../shared/ipc";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  /** The question, or the answer as it streams in. */
  content: string;
  /** Assistant only: output is still arriving. */
  streaming?: boolean;
  /** Assistant only: how the run ended, once it has. */
  outcome?: ClaudeRunResult["outcome"];
  /** Assistant only: a refusal, a stderr tail, or a spawn failure — shown under the bubble. */
  error?: string | null;
  /** Assistant only: the exact prompt that produced this answer, kept so it stays inspectable. */
  prompt?: string;
  argv?: string[];
}

/** A previewed question waiting on the user. Nothing has been spawned to produce one. */
export interface PendingChatRun {
  preview: ClaudePreview;
  question: string;
}

interface ChatContextValue {
  open: boolean;
  setOpen(open: boolean): void;
  messages: ChatMessage[];
  /** Non-null while a previewed question is waiting for Run or Cancel. */
  pending: PendingChatRun | null;
  /** A preview is being built (no process involved) — the send button is busy. */
  previewing: boolean;
  running: boolean;
  /** Ask before every run. TRUE BY DEFAULT; session-scoped; never persisted. */
  askBeforeRun: boolean;
  setAskBeforeRun(ask: boolean): void;
  /** Build the prompt for a question and, unless asking is on, run it. Spawns nothing by itself. */
  send(text: string): Promise<void>;
  /** Run what is pending. The only call in this app that can start a chat's Claude process. */
  confirm(): Promise<void>;
  /** Drop what is pending. Nothing was started, so there is nothing to stop. */
  decline(): void;
  /** Stop the run in flight — kills the CLI's whole process group. */
  stop(): void;
  clear(): void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

/** How many completed turns ride along on the next question. Main caps this again. */
const HISTORY_TURNS = 10;

let nextId = 0;
const newId = () => `m${++nextId}`;

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<PendingChatRun | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [running, setRunning] = useState(false);
  // THE DEFAULT IS TO ASK. Everything above this line is why.
  const [askBeforeRun, setAskBeforeRun] = useState(true);

  /** The token of the run in flight, so Stop has something to signal. */
  const runningToken = useRef<string | null>(null);
  const { current } = useProject();
  const projectRoot = current?.root ?? "";

  /**
   * A project switch ends the chat session.
   *
   * Main already drops outstanding preview tokens on a switch (a token names the outgoing
   * project's cwd), so a pending confirmation would be un-runnable anyway — but a transcript about
   * repo A left on screen over repo B is its own kind of wrong, and the opt-out has to expire with
   * the session it was scoped to. Cheaper and clearer than deciding, per message, whose project it
   * was about.
   */
  useEffect(() => {
    setMessages([]);
    setPending(null);
    setAskBeforeRun(true);
  }, [projectRoot]);

  const append = useCallback((msg: ChatMessage) => setMessages((prev) => [...prev, msg]), []);

  const patch = useCallback(
    (id: string, next: Partial<ChatMessage>) =>
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...next } : m))),
    []
  );

  /**
   * Run a previewed question, streaming the answer into its own bubble.
   *
   * The bubble is created empty and filled chunk by chunk, which is the whole reason `claude.run`
   * takes an output callback: these runs are tens of seconds, and a panel with nothing in it is
   * indistinguishable from one that has hung.
   */
  const runPreview = useCallback(
    async ({ preview }: PendingChatRun) => {
      if (!preview.token) return;
      const id = newId();
      const token = preview.token;
      runningToken.current = token;
      setRunning(true);
      append({
        id,
        role: "assistant",
        content: "",
        streaming: true,
        prompt: preview.prompt,
        argv: preview.argv,
      });

      let stderr = "";
      try {
        // callMain: `claude:run` REJECTS on a refused token (replayed, expired, or issued for
        // something other than a chat), and a bare await would leave the bubble streaming forever.
        const res = await callMain(() =>
          window.maestro.claude.run(token, (chunk) => {
            if (chunk.stream === "stdout") {
              setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: m.content + chunk.chunk } : m)));
            } else {
              stderr += chunk.chunk;
            }
          })
        );

        if (!res.ok) {
          patch(id, { streaming: false, outcome: "crashed", error: res.error });
          return;
        }

        const result = res.value;
        const done: Partial<ChatMessage> = { streaming: false, outcome: result.outcome };
        if (result.outcome === "ok") {
          // Normalised from the result rather than left as the concatenated chunks: identical
          // bytes, minus the trailing newline every `-p` run ends with.
          done.content = result.stdout.trim() || "(no output)";
          done.error = null;
        } else {
          // stderr is surfaced only when it explains something: a successful run's warnings are
          // noise in a chat, a failed run's stderr is the answer to "why not".
          done.error = result.error ?? ((stderr || result.stderr).trim().split("\n").slice(-4).join("\n") || null);
        }
        patch(id, done);
      } finally {
        runningToken.current = null;
        setRunning(false);
      }
    },
    [append, patch]
  );

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || previewing || running || pending) return;

      // Only completed exchanges travel: a half-streamed answer would put a truncated sentence
      // into the next prompt, and it is the prompt the user is about to be shown.
      const history: ChatTurn[] = messages
        .filter((m) => !m.streaming && m.content.trim() !== "" && (m.role === "user" || m.outcome === "ok"))
        .slice(-HISTORY_TURNS)
        .map((m) => ({ role: m.role, content: m.content }));

      append({ id: newId(), role: "user", content: question });
      setPreviewing(true);
      try {
        const res = await callMain(() =>
          window.maestro.claude.preview({ kind: "help-chat", message: question, history })
        );
        if (!res.ok) {
          append({ id: newId(), role: "assistant", content: "", outcome: "crashed", error: res.error });
          return;
        }
        const next: PendingChatRun = { preview: res.value, question };
        // No CLI: there is no token and nothing to confirm. The card still renders, with the
        // prompt and Copy prompt, which is the whole fallback on a machine without the CLI.
        if (askBeforeRun || !res.value.token) {
          setPending(next);
          return;
        }
        await runPreview(next);
      } finally {
        setPreviewing(false);
      }
    },
    [append, askBeforeRun, messages, pending, previewing, running, runPreview]
  );

  const confirm = useCallback(async () => {
    if (!pending) return;
    const next = pending;
    setPending(null);
    await runPreview(next);
  }, [pending, runPreview]);

  const decline = useCallback(() => {
    if (!pending) return;
    setPending(null);
    append({
      id: newId(),
      role: "assistant",
      content: "",
      outcome: "cancelled",
      error: "Cancelled before anything ran.",
    });
  }, [append, pending]);

  const stop = useCallback(() => {
    const token = runningToken.current;
    if (token) void window.maestro.claude.cancel(token);
  }, []);

  const clear = useCallback(() => {
    if (running) return;
    setMessages([]);
    setPending(null);
  }, [running]);

  const value = useMemo<ChatContextValue>(
    () => ({
      open,
      setOpen,
      messages,
      pending,
      previewing,
      running,
      askBeforeRun,
      setAskBeforeRun,
      send,
      confirm,
      decline,
      stop,
      clear,
    }),
    [askBeforeRun, clear, confirm, decline, messages, open, pending, previewing, running, send, stop]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider> — it is mounted in __root.tsx.");
  return ctx;
}

export type { ClaudePreview };
