export function PaletteIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-5 flex-none"
    >
      <path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4.5 4H16a2 2 0 0 0-1.4 3.4A1.6 1.6 0 0 1 12 22z" />
      <circle cx="7.5" cy="10.5" r="1" fill="currentColor" />
      <circle cx="10.5" cy="6.5" r="1" fill="currentColor" />
      <circle cx="15.5" cy="7.5" r="1" fill="currentColor" />
    </svg>
  )
}

/** The Tailwind CSS mark (simple-icons). */
export function TailwindIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="size-5 flex-none"
    >
      <path d="M12 4.8c-3.2 0-5.2 1.6-6 4.8 1.2-1.6 2.6-2.2 4.2-1.8.91.23 1.57.89 2.29 1.62C13.67 10.62 15.03 12 18 12c3.2 0 5.2-1.6 6-4.8-1.2 1.6-2.6 2.2-4.2 1.8-.91-.23-1.57-.89-2.29-1.62C16.34 6.18 14.98 4.8 12 4.8zM6 12c-3.2 0-5.2 1.6-6 4.8 1.2-1.6 2.6-2.2 4.2-1.8.91.23 1.57.89 2.29 1.62 1.18 1.2 2.54 2.58 5.51 2.58 3.2 0 5.2-1.6 6-4.8-1.2 1.6-2.6 2.2-4.2 1.8-.91-.23-1.57-.89-2.29-1.62C10.34 13.38 8.98 12 6 12z" />
    </svg>
  )
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path
        d="M4 10l4-4 4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Burger({ open }: { open: boolean }) {
  const bar = 'block h-0.5 w-5 bg-current transition-all duration-300'
  return (
    <span className="mx-auto flex w-5 flex-col gap-[5px]" aria-hidden="true">
      <span className={`${bar} ${open ? 'translate-y-[7px] rotate-45' : ''}`} />
      <span className={`${bar} ${open ? 'opacity-0' : ''}`} />
      <span
        className={`${bar} ${open ? '-translate-y-[7px] -rotate-45' : ''}`}
      />
    </span>
  )
}
