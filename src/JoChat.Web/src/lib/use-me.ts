import { createContext, useContext } from 'react'
import type { Me } from './api'

export const MeContext = createContext<Me | null>(null)

/** The signed-in user's profile, or null while it loads. */
export function useMe(): Me | null {
  return useContext(MeContext)
}

export function useIsAdmin(): boolean {
  return useMe()?.roles.includes('SuperAdmin') ?? false
}
