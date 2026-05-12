import { useEffect, useRef } from 'react'

interface SlidePanelProps {
  isOpen: boolean
  onClose: () => void
  side: 'left' | 'right'
  widthClass?: string
  toggleDataAttr?: string | string[]
  children: React.ReactNode
  className?: string
}

export default function SlidePanel({
  isOpen,
  onClose,
  side,
  widthClass = 'w-64',
  toggleDataAttr,
  children,
  className = '',
}: SlidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    function onMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement
      const attrs = Array.isArray(toggleDataAttr) ? toggleDataAttr : toggleDataAttr ? [toggleDataAttr] : []
      if (attrs.some((attr) => target.closest(`[${attr}]`))) return
      if (panelRef.current && !panelRef.current.contains(target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [isOpen, onClose, toggleDataAttr])

  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  const sideClasses = side === 'left' ? 'left-0 border-r' : 'right-0 border-l'
  const closedTransform = side === 'left' ? '-translate-x-full' : 'translate-x-full'

  return (
    <div
      ref={panelRef}
      className={`fixed top-0 z-50 flex h-full flex-col bg-(--bg) shadow-(--shadow-2) pt-14 transition-transform duration-200 ease-in-out ${widthClass} ${sideClasses} ${
        isOpen ? 'translate-x-0' : closedTransform
      } ${className}`}
    >
      {children}
    </div>
  )
}
