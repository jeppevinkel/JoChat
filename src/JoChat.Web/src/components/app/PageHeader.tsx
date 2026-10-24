import type { ReactNode } from 'react'
import { Menu, MessageSquarePlus, PanelLeftOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useShell } from '@/lib/use-shell'
import { cn } from '@/lib/utils'

// Top bar shared by every signed-in page. While the sidebar is hidden (narrow screens, or
// collapsed on desktop) it carries the buttons to bring it back and to start a chat.
export function PageHeader({ children, className }: { children?: ReactNode; className?: string }) {
  const { isDesktop, sidebarInline, openSidebar, newChat } = useShell()
  return (
    <header className={cn('border-border flex min-h-12 shrink-0 items-center gap-2 border-b px-3 py-1.5 sm:px-4', !sidebarInline && 'pl-1.5 sm:pl-2', className)}>
      {!sidebarInline && (
        <Button variant="ghost" size="icon" aria-label="Show sidebar" title="Show sidebar" onClick={openSidebar} className="pointer-coarse:size-10">
          {isDesktop ? <PanelLeftOpen /> : <Menu />}
        </Button>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      {!sidebarInline && (
        <Button variant="ghost" size="icon" aria-label="New chat" title="New chat" onClick={newChat} className="pointer-coarse:size-10">
          <MessageSquarePlus />
        </Button>
      )}
    </header>
  )
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="font-heading min-w-0 flex-1 truncate text-base font-semibold">{children}</h1>
}
