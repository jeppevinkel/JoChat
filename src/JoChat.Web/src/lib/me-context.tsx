import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useApi, type Me } from './api'
import { MeContext } from './use-me'

// Loaded once after sign-in; role flags drive what the sidebar offers (e.g. admin pages) and the
// default persona decides whether "New conversation" can skip the persona picker.
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

  const setDefaultPersona = useCallback(
    async (personaId: string | null) => {
      await api.setDefaultPersona(personaId)
      setMe(await api.me())
    },
    [api],
  )

  const value = useMemo(() => ({ me, setDefaultPersona }), [me, setDefaultPersona])
  return <MeContext.Provider value={value}>{children}</MeContext.Provider>
}
