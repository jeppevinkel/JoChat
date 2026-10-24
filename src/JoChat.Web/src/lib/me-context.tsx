import { useEffect, useState, type ReactNode } from 'react'
import { useApi, type Me } from './api'
import { MeContext } from './use-me'

// Loaded once after sign-in; role flags drive what the sidebar offers (e.g. admin pages).
export function MeProvider({ children }: { children: ReactNode }) {
  const api = useApi()
  const [me, setMe] = useState<Me | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .me()
      .then((m) => {
        if (!cancelled) setMe(m)
      })
      .catch(() => {
        if (!cancelled) setMe(null)
      })
    return () => {
      cancelled = true
    }
  }, [api])

  return <MeContext.Provider value={me}>{children}</MeContext.Provider>
}
