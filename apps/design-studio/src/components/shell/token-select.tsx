import { useEffect, useId, useRef, useState } from 'react'
import type { TokenInfo } from '#/inspector/trace'

/** Rendered entries at most: the search narrows the rest. */
const LIMIT = 200

function Swatch({ value }: { value: string }) {
  return (
    <i
      className="size-3.5 flex-none rounded-sm border border-(--line-2)"
      style={{ background: value || 'transparent' }}
    />
  )
}

/**
 * A token name that is a dropdown with a search bar. `options` are already of the right kind; each shows its light and
 * dark values (with swatches for colors). Disabled, it is the plain name.
 */
export function TokenSelect({
  current,
  options,
  color,
  disabled,
  title,
  onPick,
}: {
  current: string
  /** The candidates for the row that match the search text. */
  options: (query: string) => TokenInfo[]
  color: boolean
  disabled: boolean
  title?: string
  onPick: (token: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [place, setPlace] = useState({ left: 0, bottom: 0, height: 280 })
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()

  const list = open ? options(query) : []
  const shown = list.slice(0, LIMIT)

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e.type === 'scroll' && panel.current?.contains(e.target as Node))
        return
      if (
        e.type === 'pointerdown' &&
        (panel.current?.contains(e.target as Node) ||
          button.current?.contains(e.target as Node))
      )
        return
      setOpen(false)
    }
    document.addEventListener('pointerdown', close, true)
    document.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', close, true)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  useEffect(() => {
    panel.current
      ?.querySelector('[aria-selected=true]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const openPanel = () => {
    const rect = button.current?.getBoundingClientRect()
    if (rect)
      // The footer sits at the bottom of the window: the list opens upward.
      setPlace({
        left: Math.min(rect.left, window.innerWidth - 360),
        bottom: window.innerHeight - rect.top + 4,
        height: Math.min(320, rect.top - 16),
      })
    setQuery('')
    setActive(0)
    setOpen(true)
  }

  const choose = (name: string) => {
    setOpen(false)
    button.current?.focus()
    if (name !== current) onPick(name)
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        disabled={disabled}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`Switch ${current} for this element`}
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="inline-flex max-w-full cursor-pointer items-center gap-1 rounded bg-(--primary-dim) px-1.5 py-0.5 font-mono text-xs text-(--primary) enabled:hover:bg-(--bg-3) disabled:cursor-default"
      >
        <span className="truncate">{current}</span>
        {!disabled && <span aria-hidden>▾</span>}
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          className="fixed z-30 flex w-[340px] flex-col rounded-lg border border-(--line) bg-(--bg-elev) text-xs text-(--ink) shadow-lg"
          style={{
            left: place.left,
            bottom: place.bottom,
            maxHeight: place.height,
          }}
        >
          <input
            autoFocus
            type="search"
            role="combobox"
            aria-expanded
            aria-controls={`${id}-list`}
            aria-label="Search tokens"
            placeholder="Search tokens"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setOpen(false)
                button.current?.focus()
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(a + 1, shown.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(a - 1, 0))
              } else if (e.key === 'Enter' && shown[active]) {
                e.preventDefault()
                choose(shown[active].name)
              }
            }}
            className="m-1.5 h-7 rounded-md border border-(--line-2) bg-(--bg) px-2 text-(--ink)"
          />
          <ul
            id={`${id}-list`}
            role="listbox"
            className="min-h-0 flex-1 overflow-y-auto pb-1"
          >
            {shown.map((t, i) => (
              <li
                key={t.name}
                role="option"
                aria-selected={i === active}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(t.name)}
                className="flex cursor-pointer items-center gap-2 px-2 py-1 aria-selected:bg-(--bg-2)"
              >
                <span className="min-w-0 flex-1 truncate font-mono">
                  {t.name}
                  {t.name === current && ' ✓'}
                </span>
                {(['light', 'dark'] as const).map((mode) => (
                  <span
                    key={mode}
                    title={mode}
                    className="flex w-[84px] flex-none items-center gap-1 text-(--ink-3)"
                  >
                    {color && <Swatch value={t.values[mode]} />}
                    <code className="truncate">
                      {t.values[mode] || 'unset'}
                    </code>
                  </span>
                ))}
              </li>
            ))}
            {shown.length === 0 && (
              <li className="px-2 py-2 text-(--ink-3)">
                No token of this kind{query ? ' matches' : ''}.
              </li>
            )}
            {list.length > shown.length && (
              <li className="px-2 py-1 text-(--ink-3)">
                {list.length - shown.length} more: type to narrow the list.
              </li>
            )}
          </ul>
        </div>
      )}
    </>
  )
}
