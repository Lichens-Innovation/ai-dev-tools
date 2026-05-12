import { Store } from '@tanstack/store'
import type { DocSection } from '../utils/docs'

interface SearchState {
  sections: DocSection[]
  query: string
  results: DocSection[]
  focused: boolean
  selectedIndex: number
}

export const searchStore = new Store<SearchState>({
  sections: [],
  query: '',
  results: [],
  focused: false,
  selectedIndex: -1,
})

function filterSections(sections: DocSection[], query: string): DocSection[] {
  if (!query.trim()) return []
  const lower = query.toLowerCase()
  return sections
    .filter(
      (s) =>
        s.headingText.toLowerCase().includes(lower) ||
        s.bodyText.toLowerCase().includes(lower) ||
        s.docTitle.toLowerCase().includes(lower),
    )
    .slice(0, 10)
}

export function setSections(sections: DocSection[]) {
  searchStore.setState((s) => ({ ...s, sections }))
}

export function setSearchQuery(query: string) {
  searchStore.setState((s) => ({
    ...s,
    query,
    results: filterSections(s.sections, query),
    selectedIndex: -1,
  }))
}

export function setSearchFocused(focused: boolean) {
  searchStore.setState((s) => ({ ...s, focused }))
}

export function shiftSelectedIndex(fn: (i: number, max: number) => number) {
  searchStore.setState((s) => ({
    ...s,
    selectedIndex: fn(s.selectedIndex, s.results.length - 1),
  }))
}

export function clearSearch() {
  searchStore.setState((s) => ({
    ...s,
    query: '',
    results: [],
    selectedIndex: -1,
  }))
}
