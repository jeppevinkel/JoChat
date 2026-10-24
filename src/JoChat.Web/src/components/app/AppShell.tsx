import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { useApi } from '@/lib/api'
import { useChats } from '@/lib/use-chats'
import { useDefaultPersona } from '@/lib/use-me'
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/use-media-query'
import { ShellContext, type Shell } from '@/lib/use-shell'
import { NewChatDialog } from './NewChatDialog'
import { Sidebar } from './Sidebar'

const COLLAPSED_KEY = 'jochat:sidebar-collapsed'

// Desktop: the sidebar sits beside the content and can be collapsed (remembered per browser).
// Narrow screens: it lives in a drawer opened from each page's header.
export function AppShell({ children }: { children: ReactNode }) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [collapsed, setCollapsedState] = useState(() => localStorage.getItem(COLLAPSED_KEY) === '1')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const api = useApi()
  const navigate = useNavigate()
  const { refresh } = useChats()
  const { defaultPersonaId } = useDefaultPersona()
  // Guards against a double click creating two chats; click updates flush before the next click.
  const [starting, setStarting] = useState(false)

  // Widening the window past the breakpoint retires the drawer, so it doesn't pop back open later.
  if (isDesktop && drawerOpen) setDrawerOpen(false)

  // With a default persona a new chat starts straight away (its persona can still be changed
  // before the first message); without one, or if it can't be used, the picker dialog opens.
  const startNewChat = useCallback(async () => {
    setDrawerOpen(false)
    if (!defaultPersonaId) return setNewChatOpen(true)
    if (starting) return
    setStarting(true)
    try {
      const { id } = await api.createChat(defaultPersonaId)
      await refresh()
      navigate(`/chats/${id}`)
    } catch {
      setNewChatOpen(true)
    } finally {
      setStarting(false)
    }
  }, [defaultPersonaId, starting, api, refresh, navigate])

  const shell = useMemo<Shell>(() => {
    const setCollapsed = (v: boolean) => {
      setCollapsedState(v)
      if (v) localStorage.setItem(COLLAPSED_KEY, '1')
      else localStorage.removeItem(COLLAPSED_KEY)
    }
    return {
      isDesktop,
      sidebarInline: isDesktop && !collapsed,
      openSidebar: () => (isDesktop ? setCollapsed(false) : setDrawerOpen(true)),
      newChat: () => void startNewChat(),
      hideSidebar: () => (isDesktop ? setCollapsed(true) : setDrawerOpen(false)),
    }
  }, [isDesktop, collapsed, startNewChat])

  const sidebar = (
    <Sidebar
      onNewChat={shell.newChat}
      onNavigate={() => setDrawerOpen(false)}
      onHide={shell.hideSidebar}
      className={isDesktop ? 'border-sidebar-border w-72 shrink-0 border-r' : 'w-full'}
    />
  )

  return (
    <ShellContext.Provider value={shell}>
      <div className="flex h-full">
        {shell.sidebarInline && sidebar}
        {!isDesktop && (
          <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
              <DialogPrimitive.Popup className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,85vw)] shadow-xl outline-none duration-200 data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left">
                <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
                {sidebar}
              </DialogPrimitive.Popup>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        )}
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
      <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} />
    </ShellContext.Provider>
  )
}
