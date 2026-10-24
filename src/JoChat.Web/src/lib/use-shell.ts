import { createContext, useContext } from 'react'

export interface Shell {
  /** True on desktop-sized screens, where the sidebar sits beside the content instead of in a drawer. */
  isDesktop: boolean
  /** The sidebar is currently visible next to the content (desktop and not collapsed). */
  sidebarInline: boolean
  openSidebar: () => void
  hideSidebar: () => void
  newChat: () => void
}

export const ShellContext = createContext<Shell | null>(null)

export function useShell(): Shell {
  const ctx = useContext(ShellContext)
  if (!ctx) throw new Error('useShell must be used within AppShell')
  return ctx
}
