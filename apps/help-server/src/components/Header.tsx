import { Link, useNavigate } from '@tanstack/react-router'
import { useSelector } from '@tanstack/react-store'
import { useEffect, useRef, useState } from 'react'
import Highlighter from 'react-highlight-words'
import ThemeToggle from './ThemeToggle'
import { toggleSidebar, sidebarStore } from '../store/sidebar-store'
import { searchStore, setSearchQuery, setSearchFocused, shiftSelectedIndex, clearSearch } from '../store/search-store'
import { toggleChat, chatStore } from '../store/chat-store'
import type { DocSection } from '../utils/docs'

function getSnippet(text: string, query: string, maxLen = 120): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text.slice(0, maxLen)
  const start = Math.max(0, idx - 40)
  const end = Math.min(text.length, idx + query.length + 80)
  const snippet = text.slice(start, end)
  return (start > 0 ? '…' : '') + snippet + (end < text.length ? '…' : '')
}

const DEBOUNCE_MS = 150

function useDebouncedSearch(inputRef: React.RefObject<HTMLInputElement | null>) {
  const { query, results, focused, selectedIndex } = useSelector(searchStore)
  const [inputValue, setInputValue] = useState(query)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [kbdHint, setKbdHint] = useState('⌘K')

  useEffect(() => {
    setInputValue(query)
  }, [query])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    setKbdHint(typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K')
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function updateQuery(value: string) {
    setInputValue(value)
    searchStore.setState((s) => ({ ...s, results: [], selectedIndex: -1 }))

    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) {
      setSearchQuery('')
      return
    }
    debounceRef.current = setTimeout(() => setSearchQuery(value), DEBOUNCE_MS)
  }

  function clearQuery() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setInputValue('')
    setSearchQuery('')
  }

  const showResults = focused && query.trim().length > 0

  return {
    inputValue,
    query,
    results,
    focused,
    selectedIndex,
    showResults,
    updateQuery,
    clearQuery,
    kbdHint,
  }
}

export default function Header() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const { inputValue, query, results, focused, selectedIndex, showResults, updateQuery, clearQuery, kbdHint } =
    useDebouncedSearch(inputRef)
  const sidebarOpen = useSelector(sidebarStore, (s) => s.isOpen)
  const chatOpen = useSelector(chatStore, (s) => s.isOpen)

  function handleSelect(section: DocSection) {
    navigate({
      to: '/docs/$slug',
      params: { slug: section.slug },
      search: { q: query },
      hash: section.headingId,
    })
    clearSearch()
    clearQuery()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showResults) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      shiftSelectedIndex((i, max) => Math.min(i + 1, max))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      shiftSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault()
      handleSelect(results[selectedIndex])
    } else if (e.key === 'Escape') {
      setSearchFocused(false)
      inputRef.current?.blur()
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-(--line) bg-(--header-bg) px-4 backdrop-blur-md">
      <nav className="page-wrap grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-3">
        {/* Left: hamburger + home */}
        <div className="flex items-center gap-3">
          <button
            data-sidebar-toggle
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md p-1.5 text-(--ink-2) hover:bg-(--bg-3) hover:text-(--ink)"
          >
            <span className="flex h-3.5 w-4.5 items-center justify-center">
              {sidebarOpen ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              ) : (
                <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
                  <path d="M0 1h18M0 7h18M0 13h18" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              )}
            </span>
          </button>

          <Link
            to="/"
            className="shrink-0 text-[13px] font-semibold tracking-[-0.01em] text-(--ink) no-underline hover:text-primary"
          >
            AI Dev Tools
          </Link>
        </div>

        {/* Center: Search */}
        <div className="relative w-125 max-w-md">
          <div
            className={`flex items-center gap-2 rounded-md border bg-(--bg-2) px-3 py-1.5 transition-colors ${
              focused ? 'border-primary shadow-sm' : 'border-(--line)'
            }`}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
              className="shrink-0 text-subtle"
            >
              <circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" strokeWidth="1.6" />
              <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              type="search"
              value={inputValue}
              onChange={(e) => updateQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              onKeyDown={handleKeyDown}
              placeholder="Search documentation…"
              aria-label="Search documentation"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-(--ink) placeholder-subtle outline-none"
            />
            {!focused && !inputValue && (
              <kbd className="hidden rounded-sm border border-(--line) bg-(--bg-3) px-1.5 py-0.5 text-[10px] text-subtle font-sans sm:inline-block">
                {kbdHint}
              </kbd>
            )}
            {inputValue && (
              <button
                onClick={() => {
                  clearQuery()
                  inputRef.current?.focus()
                }}
                aria-label="Clear search"
                className="shrink-0 text-subtle hover:text-(--ink)"
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>

          {showResults && (
            <div className="absolute left-0 right-0 top-full z-60 mt-1 overflow-hidden rounded-md border border-(--line) bg-(--bg-2) shadow-(--shadow-2)">
              {results.length === 0 ? (
                <p className="px-4 py-3 text-[12px] text-subtle">No results found.</p>
              ) : (
                <ul className="m-0 max-h-80 list-none overflow-y-auto overflow-x-hidden p-0 py-1" role="listbox">
                  {results.map((section, i) => (
                    <li
                      key={`${section.slug}-${section.headingId}-${i}`}
                      role="option"
                      aria-selected={i === selectedIndex}
                    >
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelect(section)}
                        className={`flex w-full flex-col gap-1 rounded-sm px-4 py-2.5 text-left mx-1 my-0.5 ${
                          i === selectedIndex ? 'bg-(--primary-dim)' : 'hover:bg-(--bg-3)'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-[12px] text-subtle">
                          <Highlighter
                            searchWords={[query]}
                            textToHighlight={section.docTitle}
                            autoEscape
                            highlightClassName="bg-[var(--primary-dim-2)] text-primary rounded-sm px-0.5"
                          />
                          {section.headingText !== section.docTitle && (
                            <>
                              <span className="opacity-40">›</span>
                              <Highlighter
                                searchWords={[query]}
                                textToHighlight={section.headingText}
                                autoEscape
                                highlightClassName="bg-[var(--primary-dim-2)] text-primary rounded-sm px-0.5"
                              />
                            </>
                          )}
                        </div>
                        <p className="m-0 line-clamp-2 text-[12px] text-(--ink)">
                          <Highlighter
                            searchWords={[query]}
                            textToHighlight={getSnippet(section.bodyText, query)}
                            autoEscape
                            highlightClassName="bg-[var(--primary-dim-2)] text-primary rounded-sm px-0.5"
                          />
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Right: Chat + Theme toggle */}
        <div className="flex items-center justify-end gap-2">
          <button
            data-chat-toggle
            onClick={toggleChat}
            aria-label={chatOpen ? 'Close help chat' : 'Open help chat'}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md p-1.5 transition ${
              chatOpen
                ? 'bg-(--primary-3) text-[#1c1917] hover:bg-(--primary-2)'
                : 'text-(--ink-2) hover:bg-(--bg-3) hover:text-(--ink)'
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {chatOpen ? (
                <path d="M4 4h16v14H7l-3 3V4z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              ) : (
                <>
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 10h8M8 14h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </>
              )}
            </svg>
          </button>
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
