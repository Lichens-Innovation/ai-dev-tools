import { useSelector } from '@tanstack/react-store'
import { useEffect, useRef, useState, useCallback } from 'react'
import SlidePanel from './SlidePanel'
import {
  chatStore,
  closeChat,
  addChatMessage,
  setChatLoading,
  setChatError,
  setChatMessages,
} from '../store/chat-store'
import { sendChatMessage, getChatHistory, clearChatHistory, checkSuperHelpAvailable } from '../utils/chat'
import type { ChatHistoryEntry } from '../utils/chat'

export default function ChatSidebar() {
  const isOpen = useSelector(chatStore, (s) => s.isOpen)
  const messages = useSelector(chatStore, (s) => s.messages)
  const isLoading = useSelector(chatStore, (s) => s.isLoading)
  const error = useSelector(chatStore, (s) => s.error)
  const [input, setInput] = useState('')
  const [skillAvailable, setSkillAvailable] = useState<boolean | null>(null)
  const localOnly = error === 'CLAUDE_NOT_FOUND'
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Check skill availability when sidebar opens
  useEffect(() => {
    if (!isOpen) return
    checkSuperHelpAvailable()
      .then(setSkillAvailable)
      .catch(() => setSkillAvailable(false))
  }, [isOpen])

  // Load history when sidebar opens
  useEffect(() => {
    if (!isOpen) return
    getChatHistory()
      .then((history: ChatHistoryEntry[]) => {
        const msgs = history.map((entry) => ({
          role: entry.role,
          content: entry.content,
          timestamp: Date.now(),
        }))
        setChatMessages(msgs)
      })
      .catch(() => {
        // History may not exist yet — that's fine
      })
  }, [isOpen])

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isLoading])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 128) + 'px'
  }, [input])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    setInput('')
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
    addChatMessage({ role: 'user', content: trimmed, timestamp: Date.now() })
    setChatLoading(true)
    setChatError(null)

    try {
      const result = await sendChatMessage({ data: { message: trimmed } })
      setChatLoading(false)

      if (result.error) {
        setChatError(result.error)
      } else {
        addChatMessage({ role: 'assistant', content: result.response, timestamp: Date.now() })
      }

      if (!result.skillAvailable) {
        setSkillAvailable(false)
      }
    } catch (e) {
      setChatLoading(false)
      setChatError(e instanceof Error ? e.message : 'Unknown error')
    }
  }, [input, isLoading])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClear = useCallback(async () => {
    await clearChatHistory()
    setChatMessages([])
    setChatError(null)
  }, [])

  const installCommand = 'claude plugin install ai-tools-manager@lichens-ai-dev-tools'

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={closeChat}
      side="right"
      widthClass="w-[32rem]"
      toggleDataAttr={['data-chat-toggle', 'data-sidebar-toggle']}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-(--line) bg-(--bg-2) px-4 py-3">
        <div className="flex items-center gap-2.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-primary">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
              fill="currentColor"
              opacity="0.9"
            />
            <path
              d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path d="M8 15h8M8 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div>
            <h2 className="text-[13px] font-semibold text-(--ink)">Help Chat</h2>
            <p className="text-[10px] text-subtle">Powered by /super-help</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              title="Clear history"
              className="flex h-7 w-7 items-center justify-center rounded-md text-subtle hover:bg-(--bg-3) hover:text-(--ink)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          <button
            onClick={closeChat}
            aria-label="Close chat"
            className="flex h-7 w-7 items-center justify-center rounded-md text-subtle hover:bg-(--bg-3) hover:text-(--ink)"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !error && skillAvailable !== false && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-(--amber-dim)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-primary">
                <path
                  d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path d="M8 15h8M8 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="m-0 text-[13px] text-subtle">
              Ask anything about Claude Code Tools.
              <br />
              The /super-help skill will assist you.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`mb-3 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                msg.role === 'user' ? 'border border-ring bg-(--amber-dim) text-primary' : 'bg-(--bg-3) text-(--ink)'
              }`}
            >
              {msg.content.split('\n').map((line, li) => (
                <span key={li}>
                  {line}
                  {li < msg.content.split('\n').length - 1 && <br />}
                </span>
              ))}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="mb-3 flex justify-start">
            <div className="flex items-center gap-2 rounded-xl bg-(--bg-3) px-3.5 py-2.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              <span className="text-[12px] text-subtle">Thinking…</span>
            </div>
          </div>
        )}

        {localOnly && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-(--bg-3)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-subtle" aria-hidden="true">
                <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="m-0 mb-1 text-[13px] font-medium text-(--ink)">Local only</p>
              <p className="m-0 text-[12px] text-subtle">
                The chat requires a local <code className="rounded bg-(--bg-3) px-1 py-0.5 text-[11px]">yarn dev</code>{' '}
                session.
              </p>
            </div>
            <div className="w-full rounded-xl border border-(--line) bg-(--bg-2) px-3.5 py-3 text-left">
              <p className="m-0 mb-1 text-[11px] font-medium uppercase tracking-wider text-subtle">Alternative</p>
              <p className="m-0 text-[12px] text-(--ink-2)">
                Use the <code className="rounded bg-(--bg-3) px-1 py-0.5 text-[11px]">/super-help</code> skill directly
                in Claude Code to get the same answers.
              </p>
            </div>
          </div>
        )}

        {error && !localOnly && (
          <div className="mb-3 rounded-xl border border-(--line) bg-(--red-dim) px-3.5 py-3 text-[13px]">
            <div className="mb-1.5 flex items-center gap-2 text-[--red]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="font-medium">Not available</span>
            </div>
            <p className="m-0 mb-3 text-[12px] text-(--ink-2)">{error}</p>
            {skillAvailable === false && (
              <div className="rounded-md border border-(--line) bg-(--bg-2) p-2.5">
                <p className="m-0 mb-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle">
                  Install command
                </p>
                <div className="flex items-center justify-between gap-2">
                  <code className="bg-transparent border-0 p-0 text-[12px] text-(--ink)">{installCommand}</code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(installCommand).catch(() => {})
                    }}
                    className="shrink-0 rounded-md border border-(--line) bg-(--bg-3) px-2 py-1 text-[11px] text-subtle hover:text-(--ink)"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-(--line) bg-(--bg-2) px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              localOnly
                ? 'Not available in Docker…'
                : skillAvailable === false
                  ? 'Install the skill to use chat…'
                  : 'Ask a question…'
            }
            disabled={isLoading || skillAvailable === false || localOnly}
            rows={1}
            className="min-h-9 max-h-32 flex-1 resize-none rounded-md border border-(--line) bg-(--bg) px-3 py-2 text-[13px] text-(--ink) placeholder-subtle outline-none transition focus:border-primary disabled:opacity-50"
            style={{ lineHeight: '1.4' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || skillAvailable === false || localOnly}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-(--amber-3) text-[#1c1917] transition hover:bg-(--amber-2) disabled:opacity-40 disabled:hover:bg-(--amber-3)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-subtle">Press Enter to send, Shift+Enter for new line</p>
      </div>
    </SlidePanel>
  )
}
