// The help chat, as a slide-out panel — and, in this slice, INERT.
//
// Two decisions live here.
//
// It is a panel, not a route. help-server's `ChatSidebar` was already a slide-out over its
// dashboard; a chat you consult *while reading something else* is exactly what the app's
// `@repo/ui/slide-panel` primitive is for, and a route would have taken the reader off the page
// they were asking about.
//
// It does not run anything, and that is the point. help-server's `utils/chat.ts` spawned the
// `claude` CLI against `/super-help` directly — no preview, no confirmation — which is the second,
// independently-grown spawn path the `claude -p` bridge exists to replace. Rebuilding it on
// `claude:preview` / `claude:run` is its own decision (a chat makes a per-message confirmation feel
// heavy, so there is a "don't ask again" to design) and is the next slice,
// .claude/maestro-tasks/013. Until then the surface exists and says so.
//
// NOTHING IN THIS FILE MAY REACH `window.maestro.claude`. A composer that "just sent one message
// to try it" would be the un-previewed spawn path arriving by the back door — the whole thing this
// milestone was sequenced after M4 to avoid. test/isolation.test.ts asserts the absence.

import { MessageCircle, Terminal, X } from "lucide-react";
import SlidePanel from "@repo/ui/slide-panel";
import CopyableText from "@repo/ui/copyable-text";

/** What to run in a Claude Code session to get the same answers today. */
const SKILL_COMMAND = "/super-help";

export default function ChatPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <SlidePanel isOpen={isOpen} onClose={onClose} side="right" widthClass="w-[28rem]" toggleDataAttr="data-chat-toggle">
      <div className="flex items-center justify-between border-b border-(--line) px-4 py-3">
        <div className="flex items-center gap-2.5">
          <MessageCircle size={16} className="text-primary" />
          <div>
            <h2 className="text-[13px] font-semibold text-(--ink) m-0">Help Chat</h2>
            <p className="text-[10px] text-subtle m-0">Powered by {SKILL_COMMAND}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="flex h-7 w-7 items-center justify-center rounded-md text-subtle hover:bg-(--bg-elev) hover:text-(--ink) bg-transparent border-0 cursor-pointer focus:outline-none"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-(--primary-dim)">
          <MessageCircle size={20} className="text-primary" />
        </div>
        <div>
          <p className="m-0 mb-1 text-[13px] font-medium text-(--ink)">Not wired up yet</p>
          <p className="m-0 text-[12px] text-subtle max-w-[22rem]">
            Asking here will run Claude on your behalf, so it goes through the same preview-and-confirm bridge as every
            other run in this app. That wiring lands with the next slice.
          </p>
        </div>
        <div className="w-full rounded-xl border border-(--line) bg-(--bg-elev) px-3.5 py-3 text-left">
          <p className="m-0 mb-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle">In the meantime</p>
          <p className="m-0 mb-2 text-[12px] text-(--ink-2)">
            Run the skill directly in a Claude Code session for the same answers.
          </p>
          <CopyableText text={SKILL_COMMAND}>
            <code className="inline-flex items-center gap-1.5 rounded-md border border-ring bg-(--primary-dim) px-2 py-1 font-mono text-[12px] text-primary">
              <Terminal size={11} /> {SKILL_COMMAND}
            </code>
          </CopyableText>
        </div>
      </div>

      <div className="border-t border-(--line) px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            disabled
            placeholder="Ask a question…"
            className="min-h-9 max-h-32 flex-1 resize-none rounded-md border border-(--line) bg-(--bg) px-3 py-2 text-[13px] text-(--ink) placeholder-subtle outline-none disabled:opacity-50"
          />
        </div>
        <p className="mt-1.5 text-[10px] text-subtle m-0">The composer opens once the chat runs through the bridge.</p>
      </div>
    </SlidePanel>
  );
}
