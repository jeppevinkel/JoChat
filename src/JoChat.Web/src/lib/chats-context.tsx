import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useApi, type ChatSummary } from './api'
import { ChatsContext } from './use-chats'

// Chat list is shared between the sidebar and the chat view (titles change after the
// first message), so it lives above both.
export function ChatsProvider({ children }: { children: ReactNode }) {
  const api = useApi()
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setChats(await api.chats())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- async fetch; setState only runs after the await
    void refresh()
  }, [refresh])

  return <ChatsContext.Provider value={{ chats, loading, error, refresh }}>{children}</ChatsContext.Provider>
}
