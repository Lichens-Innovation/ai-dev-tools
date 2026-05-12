import { useState, useRef, useEffect, useCallback } from 'react'

interface CopyableTextProps {
  text: string
  children: React.ReactNode
  className?: string
  copiedText?: string
  previewText?: string
}

export default function CopyableText({
  text,
  children,
  className = '',
  copiedText = 'Copied!',
  previewText = 'Click to copy',
}: CopyableTextProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const handleClick = useCallback(() => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 1800)
  }, [text])

  return (
    <span
      onClick={handleClick}
      className={`group relative cursor-pointer select-none ${className}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
      title={copied ? copiedText : previewText}
      aria-label={`Copy ${text}`}
    >
      {children}

      {/* Hover preview tooltip — positioned below to avoid clipping in overflow-hidden containers */}
      <span
        className="pointer-events-none absolute top-full left-1/2 z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--line-2)] bg-[var(--bg-3)] px-2 py-1 text-[11px] font-medium text-[var(--ink-2)] opacity-0 shadow-[var(--shadow-1)] transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        aria-hidden="true"
      >
        {copied ? copiedText : previewText}
      </span>

    </span>
  )
}
