import { useState } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router'
import { useAuth } from 'react-oidc-context'
import { LogOut, MessageSquarePlus, ShieldCheck, Trash2, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useApi } from '@/lib/api'
import { useChats } from '@/lib/use-chats'
import { useIsAdmin } from '@/lib/use-me'
import { cn } from '@/lib/utils'
import { NewChatDialog } from './NewChatDialog'

export function Sidebar() {
  const auth = useAuth()
  const api = useApi()
  const navigate = useNavigate()
  const { id: activeId } = useParams()
  const { chats, loading, error, refresh } = useChats()
  const isAdmin = useIsAdmin()
  const [newOpen, setNewOpen] = useState(false)

  const remove = async (id: string) => {
    if (!confirm('Delete this chat?')) return
    await api.deleteChat(id)
    await refresh()
    if (id === activeId) navigate('/')
  }

  const displayName = auth.user?.profile.name ?? auth.user?.profile.preferred_username ?? 'Signed in'

  return (
    <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border flex h-full w-72 shrink-0 flex-col border-r">
      <div className="flex items-center justify-between gap-2 p-3">
        <span className="font-heading text-lg font-semibold">JoChat</span>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <MessageSquarePlus data-icon="inline-start" />
          New chat
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-2">
        {loading && <p className="text-muted-foreground px-2 py-1 text-sm">Loading…</p>}
        {error && <p className="text-destructive px-2 py-1 text-sm">{error}</p>}
        {!loading && chats.length === 0 && (
          <p className="text-muted-foreground px-2 py-1 text-sm">No chats yet.</p>
        )}
        <ul className="flex flex-col gap-0.5 pb-2">
          {chats.map((c) => (
            <li key={c.id} className="group relative">
              <NavLink
                to={`/chats/${c.id}`}
                className={({ isActive }) =>
                  cn(
                    'hover:bg-sidebar-accent block truncate rounded-md px-2 py-1.5 pr-8 text-sm',
                    isActive && 'bg-sidebar-accent font-medium',
                  )
                }
                title={c.title}
              >
                {c.title}
              </NavLink>
              <button
                type="button"
                aria-label="Delete chat"
                onClick={() => remove(c.id)}
                className="text-muted-foreground hover:text-destructive absolute top-1/2 right-1 -translate-y-1/2 rounded p-1 opacity-0 group-hover:opacity-100 focus:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </ScrollArea>

      <div className="border-sidebar-border flex items-center justify-between gap-2 border-t p-3">
        <span className="truncate text-sm" title={displayName}>
          {displayName}
        </span>
        <div className="flex shrink-0">
          {isAdmin && (
            <NavLink
              to="/admin"
              aria-label="Admin"
              title="Admin"
              className={({ isActive }) =>
                cn(
                  'hover:bg-sidebar-accent inline-flex size-8 items-center justify-center rounded-md',
                  isActive && 'bg-sidebar-accent',
                )
              }
            >
              <ShieldCheck className="size-4" />
            </NavLink>
          )}
          <NavLink
            to="/personas"
            aria-label="Personas"
            title="Personas"
            className={({ isActive }) =>
              cn(
                'hover:bg-sidebar-accent inline-flex size-8 items-center justify-center rounded-md',
                isActive && 'bg-sidebar-accent',
              )
            }
          >
            <UserCog className="size-4" />
          </NavLink>
          <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => auth.signoutRedirect()}>
            <LogOut />
          </Button>
        </div>
      </div>

      <NewChatDialog open={newOpen} onOpenChange={setNewOpen} />
    </aside>
  )
}
