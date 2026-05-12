import { Store } from '@tanstack/store'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface ChatState {
  isOpen: boolean
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null
}

export const chatStore = new Store<ChatState>({
  isOpen: false,
  messages: [],
  isLoading: false,
  error: null,
})

export function toggleChat() {
  chatStore.setState((s) => ({ ...s, isOpen: !s.isOpen }))
}

export function openChat() {
  chatStore.setState((s) => ({ ...s, isOpen: true }))
}

export function closeChat() {
  chatStore.setState((s) => ({ ...s, isOpen: false }))
}

export function setChatLoading(loading: boolean) {
  chatStore.setState((s) => ({ ...s, isLoading: loading }))
}

export function setChatError(error: string | null) {
  chatStore.setState((s) => ({ ...s, error }))
}

export function addChatMessage(message: ChatMessage) {
  chatStore.setState((s) => ({
    ...s,
    messages: [...s.messages, message],
    error: null,
  }))
}

export function clearChatMessages() {
  chatStore.setState((s) => ({ ...s, messages: [], error: null }))
}

export function setChatMessages(messages: ChatMessage[]) {
  chatStore.setState((s) => ({ ...s, messages, error: null }))
}
