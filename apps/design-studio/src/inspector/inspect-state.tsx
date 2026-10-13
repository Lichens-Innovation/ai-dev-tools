import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { Picked } from './pick'
import type { TraceRow } from './trace'

/** What the open page offers the footer's Inspect tab: the picked element and, per kind of page, what can be done. */
export interface Inspected {
  picked: Picked | null
  /** Switches a row's token for this element only (a proposal); null on a read-only reference. */
  swap: ((row: TraceRow, token: string) => void) | null
  /** Copies a reference into a proposal (a reference); null when the page is already editable. */
  createProposal: (() => void) | null
}

export const NOTHING: Inspected = {
  picked: null,
  swap: null,
  createProposal: null,
}

interface InspectContext extends Inspected {
  /** The open page says what it has selected (and clears it with NOTHING when it closes). */
  publish: (next: Inspected) => void
}

const Context = createContext<InspectContext | null>(null)

export function useInspected(): InspectContext {
  const value = useContext(Context)
  if (!value) throw new Error('useInspected needs an InspectProvider')
  return value
}

/**
 * The bridge between the page (a reference's click picker, a proposal's editor) and the palette footer, which lives
 * in the root layout and so cannot reach the page's state.
 */
export function InspectProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Inspected>(NOTHING)
  const publish = useCallback((next: Inspected) => setState(next), [])
  const value = useMemo(() => ({ ...state, publish }), [state, publish])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
