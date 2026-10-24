import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { DRAFT_PATH, newDraftState } from '@/lib/draft'
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/use-media-query'
import { ShellContext, type Shell } from '@/lib/use-shell'
import { Sidebar } from './Sidebar'

const COLLAPSED_KEY = 'jochat:sidebar-collapsed'

// Desktop: the sidebar sits beside the content and can be collapsed (remembered per browser).
// Narrow screens: it lives in a drawer opened from each page's header.
export function AppShell({ children }: { children: ReactNode }) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [collapsed, setCollapsedState] = useState(() => localStorage.getItem(COLLAPSED_KEY) === '1')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const navigate = useNavigate()

  // Widening the window past the breakpoint retires the drawer, so it doesn't pop back open later.
  if (isDesktop && drawerOpen) setDrawerOpen(false)

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
      // A draft: nothing is created on the server until its first message is sent.
      newChat: () => {
        setDrawerOpen(false)
        navigate(DRAFT_PATH, { state: newDraftState() })
      },
      hideSidebar: () => (isDesktop ? setCollapsed(true) : setDrawerOpen(false)),
    }
  }, [isDesktop, collapsed, navigate])

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
    </ShellContext.Provider>
  )
}
