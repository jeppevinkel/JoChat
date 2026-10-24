import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ChevronLeft, ChevronRight, Lock, Search, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useApi, type AdminChatRow, type AdminPersona, type AdminUser, type AuditEntry, type Page } from '@/lib/api'
import { nextDay, relativeTime } from '@/lib/format'
import { selectClass } from '@/lib/persona'
import { useAdminUsers } from '@/lib/use-admin-users'
import { cn } from '@/lib/utils'

// Moderation views: every persona and chat regardless of owner, a search over message text, and
// the audit log of what admins have looked at. Filters are URL parameters next to `tab`.

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Reads and writes this tab's filters in the URL; changing a filter goes back to page 1. */
function useFilters() {
  const [params, setParams] = useSearchParams()
  const get = (key: string) => params.get(key) ?? ''
  const set = (patch: Record<string, string>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v)
        else next.delete(k)
      }
      if (!('page' in patch)) next.delete('page')
      return next
    })
  return { get, set }
}

function UserFilter({ users, value, onChange }: { users: AdminUser[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="admin-user">User</Label>
      <select id="admin-user" className={cn(selectClass, 'sm:w-56 pointer-coarse:h-10')} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Everyone</option>
        {users.map((u) => (
          <option key={u.profileId} value={u.profileId!}>
            {u.displayName ?? u.userName}
          </option>
        ))}
      </select>
    </div>
  )
}

function Pager({ page, onPage }: { page: Page<unknown>; onPage: (n: number) => void }) {
  if (page.total <= page.pageSize) return null
  const first = (page.page - 1) * page.pageSize + 1
  const last = Math.min(page.total, page.page * page.pageSize)
  return (
    <div className="text-muted-foreground flex items-center justify-end gap-2 text-sm">
      <span className="tabular-nums">
        {first}–{last} of {page.total}
      </span>
      <Button variant="outline" size="icon" aria-label="Previous page" disabled={page.page <= 1} onClick={() => onPage(page.page - 1)}>
        <ChevronLeft />
      </Button>
      <Button variant="outline" size="icon" aria-label="Next page" disabled={last >= page.total} onClick={() => onPage(page.page + 1)}>
        <ChevronRight />
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------- personas

export function PersonasTab() {
  const api = useApi()
  const filters = useFilters()
  const userId = filters.get('user')
  const { withProfiles, nameOf } = useAdminUsers()
  const [personas, setPersonas] = useState<AdminPersona[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.admin
      .personas(userId || undefined)
      .then((p) => {
        if (cancelled) return
        setPersonas(p)
        setError(null)
      })
      .catch((e) => !cancelled && setError(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [api, userId])

  return (
    <section className="grid gap-3">
      <p className="text-muted-foreground text-sm">Every persona, including private ones, with the system prompt it runs on.</p>
      <UserFilter users={withProfiles} value={userId} onChange={(id) => filters.set({ user: id })} />
      {error && <p className="text-destructive text-sm">{error}</p>}
      {personas?.length === 0 && <p className="text-muted-foreground text-sm">No personas.</p>}
      <ul className="grid gap-3">
        {personas?.map((p) => (
          <li key={p.id} className="bg-card rounded-lg border p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-heading text-lg font-semibold">{p.name}</span>
              <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                {p.isShared ? <Users className="size-3" /> : <Lock className="size-3" />}
                {p.isShared ? 'shared' : 'private'}
              </span>
            </div>
            <p className="text-muted-foreground text-xs">
              by {nameOf(p.ownerId)} · {p.provider}/{p.modelId}
              {p.maxTokens ? ` · ${p.maxTokens} tokens` : ''}
              {[p.enableWebSearch && 'search', p.enableWebFetch && 'fetch', p.enableCodeExecution && 'code']
                .filter(Boolean)
                .map((t) => ` · ${t}`)
                .join('')}
              {' · '}
              {p.chats > 0 ? (
                <Link to={`?tab=chats&user=${p.ownerId}`} className="decoration-accent-ink underline underline-offset-2">
                  {p.chats} {p.chats === 1 ? 'chat' : 'chats'}
                </Link>
              ) : (
                'no chats'
              )}
            </p>
            {p.description && <p className="mt-1 text-sm">{p.description}</p>}
            <details className="mt-2 text-sm">
              <summary className="text-muted-foreground cursor-pointer text-xs">System prompt</summary>
              <pre className="bg-muted mt-1.5 max-h-80 overflow-auto rounded-md p-2.5 font-mono text-xs whitespace-pre-wrap">
                {p.systemPrompt || '(empty)'}
              </pre>
            </details>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---------------------------------------------------------------- chats

export function ChatsTab() {
  const api = useApi()
  const filters = useFilters()
  const userId = filters.get('user')
  const q = filters.get('q')
  const from = filters.get('from')
  const to = filters.get('to')
  const page = Number(filters.get('page') || '1')
  const { withProfiles, nameOf } = useAdminUsers()
  const [draft, setDraft] = useState(q)
  const [result, setResult] = useState<Page<AdminChatRow> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.admin
      // `to` is exclusive on the API, so include the whole selected end day.
      .chats({ userId: userId || undefined, q: q || undefined, from: from || undefined, to: to ? nextDay(to) : undefined, page })
      .then((r) => {
        if (cancelled) return
        setResult(r)
        setError(null)
      })
      .catch((e) => !cancelled && setError(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [api, userId, q, from, to, page])

  const search = (e: FormEvent) => {
    e.preventDefault()
    filters.set({ q: draft.trim() })
  }

  return (
    <section className="grid gap-3">
      <form onSubmit={search} className="grid gap-1.5">
        <Label htmlFor="admin-search">Search message text</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input id="admin-search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Words or phrases in any message" className="pl-8 pointer-coarse:h-10" />
          </div>
          <Button type="submit" className="pointer-coarse:h-10">Search</Button>
          {q && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Clear search"
              onClick={() => {
                setDraft('')
                filters.set({ q: '' })
              }}
              className="pointer-coarse:size-10"
            >
              <X />
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">Searches are recorded in the audit log, as is opening a chat.</p>
      </form>
      <div className="flex flex-wrap items-end gap-3">
        <UserFilter users={withProfiles} value={userId} onChange={(id) => filters.set({ user: id })} />
        <div className="grid gap-1.5">
          <Label htmlFor="admin-from">Active from</Label>
          <Input id="admin-from" type="date" value={from} onChange={(e) => filters.set({ from: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="admin-to">To</Label>
          <Input id="admin-to" type="date" value={to} onChange={(e) => filters.set({ to: e.target.value })} />
        </div>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {result && (
        <p className="text-muted-foreground text-sm">
          {result.total} {result.total === 1 ? 'chat' : 'chats'}
          {q ? ` with messages containing "${q}"` : ''}
        </p>
      )}
      <ul className="divide-border grid divide-y rounded-lg border">
        {result?.items.map((c) => (
          <li key={c.id}>
            <Link to={`/admin/chats/${c.id}`} className="hover:bg-muted/60 block px-3 py-2.5 sm:px-4">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{c.title}</span>
                <span className="text-muted-foreground shrink-0 text-xs" title={c.updatedAt}>
                  {relativeTime(c.updatedAt)}
                </span>
              </div>
              <p className="text-muted-foreground truncate text-xs">
                {nameOf(c.ownerId)} · {c.personaName} · {c.messages} {c.messages === 1 ? 'message' : 'messages'}
                {c.isShared ? ' · shared' : ''}
              </p>
              {c.snippet && <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{highlight(c.snippet, q)}</p>}
            </Link>
          </li>
        ))}
        {result?.items.length === 0 && <li className="text-muted-foreground px-4 py-6 text-center text-sm">No chats match.</li>}
      </ul>
      {result && <Pager page={result} onPage={(n) => filters.set({ page: String(n) })} />}
    </section>
  )
}

// Marks every case-insensitive occurrence of `term` in `text`.
function highlight(text: string, term: string): ReactNode {
  if (!term) return text
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.split(new RegExp(`(${escaped})`, 'gi')).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="bg-accent-ink/35 text-foreground rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

// ---------------------------------------------------------------- audit

export function AuditTab() {
  const api = useApi()
  const filters = useFilters()
  const page = Number(filters.get('page') || '1')
  const { nameOf } = useAdminUsers()
  const [result, setResult] = useState<Page<AuditEntry> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.admin
      .audit(page)
      .then((r) => {
        if (cancelled) return
        setResult(r)
        setError(null)
      })
      .catch((e) => !cancelled && setError(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [api, page])

  return (
    <section className="grid gap-3">
      <p className="text-muted-foreground text-sm">
        Every time an admin opens a chat or searches message text. Repeats of the same view or search within a minute
        are recorded once.
      </p>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <ul className="divide-border grid divide-y rounded-lg border">
        {result?.items.map((a) => (
          <li key={a.id} className="flex flex-col gap-0.5 px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:gap-3 sm:px-4">
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums sm:w-36" title={a.createdAt}>
              {new Date(a.createdAt).toLocaleString()}
            </span>
            <span className="min-w-0">
              <span className="font-medium">{nameOf(a.adminId)}</span> <AuditDescription entry={a} nameOf={nameOf} />
            </span>
          </li>
        ))}
        {result?.items.length === 0 && <li className="text-muted-foreground px-4 py-6 text-center text-sm">Nothing recorded yet.</li>}
      </ul>
      {result && <Pager page={result} onPage={(n) => filters.set({ page: String(n) })} />}
    </section>
  )
}

function AuditDescription({ entry: a, nameOf }: { entry: AuditEntry; nameOf: (id: string | null) => string }) {
  if (a.action === 'view_chat') {
    const title = a.detail ?? 'a chat'
    return (
      <>
        opened{' '}
        {a.chatExists ? (
          <Link to={`/admin/chats/${a.chatId}`} className="decoration-accent-ink underline underline-offset-2">
            {title}
          </Link>
        ) : (
          <span title="This chat has since been deleted">{title} (deleted)</span>
        )}{' '}
        by {nameOf(a.targetUserId)}
      </>
    )
  }
  return (
    <>
      searched for <q className="font-medium">{a.detail}</q> {a.targetUserId ? `in ${nameOf(a.targetUserId)}'s chats` : 'across all chats'}
    </>
  )
}
