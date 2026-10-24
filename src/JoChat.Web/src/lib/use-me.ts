import { createContext, useContext } from 'react'
import type { Me } from './api'

export interface MeState {
  me: Me | null
  /** Saves (or with null clears) the persona new chats start with, then reloads the profile. */
  setDefaultPersona: (personaId: string | null) => Promise<void>
}

export const MeContext = createContext<MeState | null>(null)

function useMeState(): MeState {
  const ctx = useContext(MeContext)
  if (!ctx) throw new Error('useMe must be used within MeProvider')
  return ctx
}

/** The signed-in user's profile, or null while it loads. */
export function useMe(): Me | null {
  return useMeState().me
}

export function useIsAdmin(): boolean {
  return useMe()?.roles.includes('SuperAdmin') ?? false
}

export function useDefaultPersona(): { defaultPersonaId: string | null; setDefaultPersona: MeState['setDefaultPersona'] } {
  const { me, setDefaultPersona } = useMeState()
  return { defaultPersonaId: me?.defaultPersonaId ?? null, setDefaultPersona }
}
