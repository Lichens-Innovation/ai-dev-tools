import { Store } from '@tanstack/store'

export const sidebarStore = new Store({ isOpen: false })

export function toggleSidebar() {
  sidebarStore.setState((s) => ({ isOpen: !s.isOpen }))
}

export function closeSidebar() {
  sidebarStore.setState(() => ({ isOpen: false }))
}
