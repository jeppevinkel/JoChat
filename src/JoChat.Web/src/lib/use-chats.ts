import { createContext, useContext } from 'react'
import type { ChatSummary } from './api'

export interface ChatsState {
  chats: ChatSummary[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export const ChatsContext = createContext<ChatsState | null>(null)

export function useChats(): ChatsState {
  const ctx = useContext(ChatsContext)
  if (!ctx) throw new Error('useChats must be used within ChatsProvider')
  return ctx
}
