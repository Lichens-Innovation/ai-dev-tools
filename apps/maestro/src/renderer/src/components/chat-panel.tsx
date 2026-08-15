// The help chat, as a slide-out panel — now running on the `claude -p` bridge.
//
// It is a panel, not a route. help-server's `ChatSidebar` was already a slide-out over its
// dashboard; a chat you consult *while reading something else* is exactly what
// `@repo/ui/slide-panel` is for, and a route would take the reader off the page they are asking
// about. The transcript and the run live in `utils/chat-context.tsx`, mounted at the root, so
// navigating away does not lose an answer mid-stream.
//
// THIS FILE MAY NOT REACH `window.maestro.claude`. Every run goes through `useChat()`, which
// previews first — a composer that "just sent one message to try it" would be the un-previewed
// spawn path help-server had, arriving by the back door. `test/isolation.test.ts` asserts the
// absence here and the presence there.
//
// What the user sees before anything runs is the point of the whole slice: the exact prompt,
// scrollable and selectable, the exact argv, the working directory, and the fact that the run is
// NOT given edit permission. Cancel is a genuine no-op, because the preview that built this card
// came from a channel that cannot spawn.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Copy, MessageCircle, Play, Send, Square, Terminal, Trash2, X } from "lucide-react";
import SlidePanel from "@repo/ui/slide-panel";
import CopyableText from "@repo/ui/copyable-text";
import ReadScope from "./read-scope";
import { useChat, type ChatMessage, type PendingChatRun } from "../utils/chat-context";
import { useProject } from "../utils/project-context";

/** What to run in a Claude Code session to get the same answers by hand. */
const SKILL_COMMAND = "/super-help";

export default function ChatPanel() {
  const chat = useChat();
  const { current } = useProject();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const busy = chat.previewing || chat.running || chat.pending !== null;
  const noProject = !current;

  // Follow the tail as an answer streams in, the way a terminal does.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages, chat.pending]);

  useEffect(() => {
    if (chat.open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [chat.open]);

  // Auto-grow the composer up to a few lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  const submit = () => {
    const text = input.trim();
    if (!text || busy || noProject) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    void chat.send(text);
  };

  return (
    <SlidePanel
      isOpen={chat.open}
      onClose={() => chat.setOpen(false)}
      side="right"
      widthClass="w-[32rem]"
      toggleDataAttr="data-chat-toggle"
    >
      <div className="flex items-center justify-between border-b border-(--line) px-4 py-3">
        <div className="flex items-center gap-2.5">
          <MessageCircle size={16} className="text-primary" />
          <div>
            <h2 className="text-[13px] font-semibold text-(--ink) m-0">Help Chat</h2>
            <p className="text-[10px] text-subtle m-0">Powered by {SKILL_COMMAND}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {chat.messages.length > 0 && (
            <button
              type="button"
              onClick={chat.clear}
              disabled={chat.running}
              title="Clear this conversation"
              className="flex h-7 w-7 items-center justify-center rounded-md text-subtle hover:bg-(--bg-elev) hover:text-(--ink) bg-transparent border-0 cursor-pointer focus:outline-none disabled:opacity-40"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => chat.setOpen(false)}
            aria-label="Close chat"
            className="flex h-7 w-7 items-center justify-center rounded-md text-subtle hover:bg-(--bg-elev) hover:text-(--ink) bg-transparent border-0 cursor-pointer focus:outline-none"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/*
        THE OPT-OUT LIVES HERE, IN BOTH STATES.
        It is a session setting that decides whether the app runs Claude without stopping to ask,
        so it is not allowed to be a thing the user turned on once and can never find again. On
        screen, on every message, revocable with one click.
      */}
      <div className="flex items-center justify-between gap-2 border-b border-(--line) bg-(--bg-elev) px-4 py-2">
        <label
          data-testid="chat-ask-toggle"
          className="flex items-center gap-2 text-[11px] text-(--ink-2) cursor-pointer select-none"
        >
          <input
            type="checkbox"
            checked={chat.askBeforeRun}
            onChange={(e) => chat.setAskBeforeRun(e.target.checked)}
            className="cursor-pointer accent-[var(--primary)]"
          />
          Show me the prompt before each run
        </label>
        <span className="text-[10px] text-(--ink-3)">
          {chat.askBeforeRun ? "this session" : "off for this session"}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {chat.messages.length === 0 && !chat.pending && <EmptyState noProject={noProject} />}

        {chat.messages.map((msg) => (
          <Bubble key={msg.id} msg={msg} onStop={chat.stop} />
        ))}

        {chat.pending && (
          <ConfirmCard pending={chat.pending} onRun={() => void chat.confirm()} onCancel={chat.decline} />
        )}

        {chat.previewing && (
          <div className="mb-3 text-[11px] text-(--ink-3)">Building the prompt… (nothing has been started)</div>
        )}
      </div>

      <div className="border-t border-(--line) px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
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
            placeholder={noProject ? "Open a project first…" : "Ask a question…"}
            className="min-h-9 max-h-32 flex-1 resize-none rounded-md border border-(--line) bg-(--bg) px-3 py-2 text-[13px] text-(--ink) placeholder-subtle outline-none transition focus:border-primary disabled:opacity-50"
            style={{ lineHeight: "1.4" }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!input.trim() || busy || noProject}
            aria-label="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-white transition hover:brightness-110 disabled:opacity-40 cursor-pointer focus:outline-none border-0"
          >
            <Send size={15} />
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-subtle m-0">
          {chat.askBeforeRun
            ? "Enter to send. You will see the prompt before anything runs."
            : "Enter to send. Runs start immediately — the prompt is kept on each answer."}
        </p>
      </div>
    </SlidePanel>
  );
}

function EmptyState({ noProject }: { noProject: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-(--primary-dim)">
        <MessageCircle size={20} className="text-primary" />
      </div>
      <div>
        <p className="m-0 mb-1 text-[13px] font-medium text-(--ink)">
          {noProject ? "Open a project to start" : "Ask anything about your Claude Code tooling"}
        </p>
        <p className="m-0 text-[12px] text-subtle max-w-[24rem]">
          {noProject
            ? "The chat runs Claude in the open project's directory, so it needs one."
            : `Each question runs the ${SKILL_COMMAND} skill headlessly in this project. It answers; it is not given permission to edit files.`}
        </p>
      </div>
      <div className="w-full rounded-xl border border-(--line) bg-(--bg-elev) px-3.5 py-3 text-left">
        <p className="m-0 mb-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle">Or, by hand</p>
        <CopyableText text={SKILL_COMMAND}>
          <code className="inline-flex items-center gap-1.5 rounded-md border border-ring bg-(--primary-dim) px-2 py-1 font-mono text-[12px] text-primary">
            <Terminal size={11} /> {SKILL_COMMAND}
          </code>
        </CopyableText>
      </div>
    </div>
  );
}

/**
 * The confirmation, INLINE IN THE TRANSCRIPT rather than as a modal.
 *
 * `ClaudeRunDialog` is the right shape for a one-shot form submit, where the run is the last thing
 * that happens on the page. In a chat the answer belongs in the conversation, so the confirmation
 * belongs there too — a modal would put the prompt in one place and the reply in another, and the
 * streamed output would land behind a dialog the user has to dismiss.
 *
 * What it shows is what the modal shows, and for the same reason: the full prompt verbatim, the
 * exact argv, and the working directory. Never a summary — this is the thing being consented to.
 */
function ConfirmCard({ pending, onRun, onCancel }: { pending: PendingChatRun; onRun(): void; onCancel(): void }) {
  const { preview } = pending;
  return (
    <div
      data-testid="chat-confirm"
      className="mb-3 rounded-xl border border-primary bg-(--bg-elev) px-3.5 py-3 flex flex-col gap-2.5"
    >
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-(--ink)">
        <Terminal size={13} className="text-primary" /> Run this on your machine?
      </div>

      <div className="flex flex-col gap-1 text-[10px]">
        <div className="flex gap-2">
          <span className="shrink-0 w-[64px] text-(--ink-3)">Working dir</span>
          <span data-testid="chat-cwd" className="font-mono text-(--ink) break-all select-text">
            {preview.cwd}
          </span>
        </div>
        <div className="flex gap-2">
          <span className="shrink-0 w-[64px] text-(--ink-3)">Command</span>
          <span data-testid="chat-argv" className="font-mono text-(--ink-2) break-all select-text">
            {preview.argv.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ")}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-[10px] font-semibold text-subtle uppercase tracking-wide">Prompt sent to Claude</div>
        <pre
          data-testid="chat-prompt"
          className="m-0 max-h-40 overflow-auto rounded-lg border border-(--line) bg-(--bg) p-2.5 font-mono text-[11px] leading-5 text-(--ink) whitespace-pre-wrap break-words select-text"
        >
          {preview.prompt}
        </pre>
      </div>

      {/*
        `targets` is empty for a chat, and that is a fact about the invocation rather than a hope:
        the empty write scope rides on the preview token, and the session's permission callback
        refuses every write against it, with a reason. Said in words, because an empty list says
        nothing.

        Reading is the other half of that sentence, and used to be the missing half: "not given
        permission to edit files" was true and, on its own, misleading — the question is answered by
        a session that can read the whole project without ever prompting. The scope below says which
        tree that is, in the same terms the create-* confirmation uses.
      */}
      <p className="m-0 text-[10px] text-(--ink-3)">
        This run answers a question. It is not given permission to edit files — but it can read everything listed below.
      </p>

      <ReadScope read={preview.read} compact />

      {!preview.available && (
        <div
          data-testid="chat-unavailable"
          className="flex items-start gap-2 px-2.5 py-2 rounded-lg text-[11px] bg-amber-500/10"
        >
          <AlertTriangle size={13} className="shrink-0 mt-px text-amber-500" />
          <span className="text-(--ink-2)">{preview.unavailable}</span>
        </div>
      )}

      <div className="flex items-center gap-2 justify-end">
        <PromptCopy prompt={preview.prompt} />
        <div className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="px-2.5 py-1 text-[11px] rounded-lg bg-(--bg) border border-(--line) text-(--ink-2) hover:text-(--ink) cursor-pointer focus:outline-none"
        >
          Cancel
        </button>
        {/* Hidden with no CLI: the useful control in that state is Copy prompt, above. */}
        {preview.available && (
          <button
            type="button"
            data-testid="chat-run"
            onClick={onRun}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-primary text-white cursor-pointer focus:outline-none hover:brightness-110 border-0"
          >
            <Play size={11} /> Run
          </button>
        )}
      </div>
    </div>
  );
}

/** Copy the exact prompt. Works in every state, including with no CLI installed. */
function PromptCopy({ prompt }: { prompt: string }) {
  return (
    <CopyableText
      text={prompt}
      copiedText="Prompt copied!"
      previewText="Copy the exact prompt, to run in a session yourself"
      className="inline-flex items-center gap-1.5 rounded-lg border border-(--line) bg-(--bg) px-2.5 py-1 text-[11px] text-(--ink-2) transition-colors hover:text-(--ink) data-[copied]:border-(--green) data-[copied]:text-(--green)"
    >
      {(copied) =>
        copied ? (
          <>
            <Check size={11} /> Copied!
          </>
        ) : (
          <>
            <Copy size={11} /> Copy prompt
          </>
        )
      }
    </CopyableText>
  );
}

function Bubble({ msg, onStop }: { msg: ChatMessage; onStop(): void }) {
  if (msg.role === "user") {
    return (
      <div className="mb-3 flex justify-end">
        <div className="max-w-[85%] rounded-xl border border-ring bg-(--primary-dim) px-3.5 py-2.5 text-[13px] leading-relaxed text-(--ink) whitespace-pre-wrap break-words select-text">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3 flex flex-col items-start gap-1.5" data-testid="chat-answer" data-outcome={msg.outcome ?? ""}>
      {(msg.content || msg.streaming) && (
        <div className="max-w-[92%] rounded-xl bg-(--bg-elev) px-3.5 py-2.5 text-[13px] leading-relaxed text-(--ink) whitespace-pre-wrap break-words select-text">
          {msg.content || "Thinking…"}
        </div>
      )}

      {msg.streaming && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-(--ink-3)">● running</span>
          <button
            type="button"
            data-testid="chat-stop"
            onClick={onStop}
            className="inline-flex items-center gap-1 rounded-md bg-red-500/10 border border-red-500/40 px-2 py-0.5 text-[10px] text-red-500 hover:bg-red-500/20 cursor-pointer focus:outline-none"
          >
            <Square size={9} /> Stop
          </button>
        </div>
      )}

      {msg.error && (
        <div className="flex items-start gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11px] max-w-[92%]">
          <AlertTriangle size={12} className="shrink-0 mt-px text-red-500" />
          <span className="text-(--ink-2) whitespace-pre-wrap break-words">{msg.error}</span>
        </div>
      )}

      {/*
        Kept on every answer, including ones that ran without stopping to ask. Turning the
        confirmation off is a choice not to be interrupted, not a choice to stop being told what
        was run on your machine.
      */}
      {msg.prompt && !msg.streaming && (
        <details className="max-w-[92%] text-[10px] text-(--ink-3)">
          <summary className="cursor-pointer">Prompt sent</summary>
          <pre className="m-0 mt-1 max-h-32 overflow-auto rounded-md border border-(--line) bg-(--bg-elev) p-2 font-mono text-[10px] leading-4 text-(--ink-2) whitespace-pre-wrap break-words select-text">
            {msg.prompt}
          </pre>
        </details>
      )}
    </div>
  );
}
