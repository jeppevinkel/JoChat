import { useMemo, useState, type ComponentType } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router'
import { useAuth } from 'react-oidc-context'
import { LogOut, PanelLeftClose, Plus, Search, ShieldCheck, Trash2, UserCog, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useApi, type ChatSummary } from '@/lib/api'
import { useChats } from '@/lib/use-chats'
import { useIsAdmin } from '@/lib/use-me'
import { cn } from '@/lib/utils'
import { Wordmark } from './Brand'

interface Props {
  className?: string
  onNewChat: () => void
  /** Called after following a link, so the mobile drawer can close itself. */
  onNavigate?: () => void
  onHide: () => void
}

export function Sidebar({ className, onNewChat, onNavigate, onHide }: Props) {
  const auth = useAuth()
  const api = useApi()
  const navigate = useNavigate()
  const { id: activeId } = useParams()
  const { chats, loading, error, refresh } = useChats()
  const isAdmin = useIsAdmin()
  const [query, setQuery] = useState('')

  const remove = async (id: string) => {
    if (!confirm('Delete this chat?')) return
    await api.deleteChat(id)
    await refresh()
    if (id === activeId) navigate('/')
  }

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return groupByAge(q ? chats.filter((c) => c.title.toLowerCase().includes(q)) : chats)
  }, [chats, query])

  const displayName = auth.user?.profile.name ?? auth.user?.profile.preferred_username ?? 'Signed in'

  return (
    <aside className={cn('bg-sidebar text-sidebar-foreground flex h-full flex-col', className)}>
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <Wordmark className="flex-1" />
        <Button variant="ghost" size="icon" aria-label="Hide sidebar" title="Hide sidebar" onClick={onHide} className="pointer-coarse:size-10">
          <PanelLeftClose />
        </Button>
      </div>

      <div className="grid gap-2 px-3 pb-2">
        <Button
          variant="outline"
          onClick={onNewChat}
          className="border-sidebar-foreground/25 hover:border-accent-ink hover:bg-sidebar-accent h-9 justify-start border-dashed bg-transparent dark:bg-transparent pointer-coarse:h-10"
        >
          <Plus data-icon="inline-start" className="text-accent-ink" />
          New conversation
        </Button>
        {chats.length > 0 && (
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
              placeholder="Search chats"
              aria-label="Search chats"
              className="bg-background pr-8 pl-8 pointer-coarse:h-10"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery('')}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 -translate-y-1/2 rounded p-1.5"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1 px-2 [&_[data-slot=scroll-area-viewport]]:overscroll-contain">
        {loading && <p className="text-muted-foreground px-2 py-1 text-sm">Loading…</p>}
        {error && <p className="text-destructive px-2 py-1 text-sm">{error}</p>}
        {!loading && chats.length === 0 && <p className="text-muted-foreground px-2 py-1 text-sm">No chats yet.</p>}
        {query && groups.length === 0 && <p className="text-muted-foreground px-2 py-1 text-sm">No matching chats.</p>}
        {groups.map((g) => (
          <section key={g.label} className="pb-2">
            <h2 className="text-muted-foreground px-2 pt-3 pb-1 text-[0.68rem] font-semibold tracking-[0.12em] uppercase">{g.label}</h2>
            <ul className="flex flex-col gap-0.5">
              {g.chats.map((c) => (
                <li key={c.id} className="group/chat relative">
                  <NavLink
                    to={`/chats/${c.id}`}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'hover:bg-sidebar-accent relative block truncate rounded-sm px-2.5 py-1.5 pr-9 text-sm pointer-coarse:py-2.5',
                        isActive && 'before:bg-accent-ink bg-sidebar-accent font-medium before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full',
                      )
                    }
                    title={c.title}
                  >
                    {c.title}
                  </NavLink>
                  <button
                    type="button"
                    aria-label={`Delete chat "${c.title}"`}
                    title="Delete chat"
                    onClick={() => void remove(c.id)}
                    className="text-muted-foreground hover:text-destructive absolute top-1/2 right-1 -translate-y-1/2 rounded p-1.5 opacity-0 group-hover/chat:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-60"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </ScrollArea>

      <nav className="border-sidebar-border grid gap-0.5 border-t p-2">
        <SideLink to="/personas" icon={UserCog} onNavigate={onNavigate}>
          Personas
        </SideLink>
        {isAdmin && (
          <SideLink to="/admin" icon={ShieldCheck} onNavigate={onNavigate}>
            Admin
          </SideLink>
        )}
      </nav>

      <div className="border-sidebar-border flex items-center gap-2 border-t p-2 pl-3">
        <span className="border-sidebar-foreground/25 font-heading flex size-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold uppercase" aria-hidden>
          {displayName.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm" title={displayName}>
          {displayName}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Sign out"
          title="Sign out"
          className="pointer-coarse:size-10"
          onClick={() => {
            localStorage.removeItem('jochat:signed-in')
            void auth.signoutRedirect()
          }}
        >
          <LogOut />
        </Button>
      </div>
    </aside>
  )
}

function SideLink({ to, icon: Icon, onNavigate, children }: { to: string; icon: ComponentType<{ className?: string }>; onNavigate?: () => void; children: string }) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'hover:bg-sidebar-accent relative flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm pointer-coarse:py-2.5',
          isActive && 'before:bg-accent-ink bg-sidebar-accent font-medium before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full',
        )
      }
    >
      <Icon className="text-muted-foreground size-4" />
      {children}
    </NavLink>
  )
}

// Buckets the (newest-first) chat list the way people remember conversations.
function groupByAge(chats: ChatSummary[]): { label: string; chats: ChatSummary[] }[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const day = 86_400_000
  const labelFor = (iso: string) => {
    const t = new Date(iso).getTime()
    if (t >= today.getTime()) return 'Today'
    if (t >= today.getTime() - day) return 'Yesterday'
    if (t >= today.getTime() - 7 * day) return 'Previous 7 days'
    if (t >= today.getTime() - 30 * day) return 'Previous 30 days'
    return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }
  const groups: { label: string; chats: ChatSummary[] }[] = []
  for (const c of chats) {
    const label = labelFor(c.updatedAt)
    const last = groups.at(-1)
    if (last?.label === label) last.chats.push(c)
    else groups.push({ label, chats: [c] })
  }
  return groups
}
