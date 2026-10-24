import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError, useApi, type AdminModel, type AdminUser, type ModelDefinitionRequest, type UsageRow } from '@/lib/api'
import { guardedClose } from '@/lib/guarded-close'
import { selectClass } from '@/lib/persona'
import { cn } from '@/lib/utils'

type Tab = 'models' | 'usage' | 'users'

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('models')
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-xl font-semibold">Admin</h1>
          <nav className="bg-muted flex gap-1 rounded-lg p-1 text-sm">
            {(['models', 'usage', 'users'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn('rounded-md px-3 py-1 capitalize', tab === t && 'bg-background shadow-xs')}
              >
                {t}
              </button>
            ))}
          </nav>
        </div>
        {tab === 'models' && <ModelsTab />}
        {tab === 'usage' && <UsageTab />}
        {tab === 'users' && <UsersTab />}
      </div>
    </div>
  )
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// ---------------------------------------------------------------- models

const emptyModel: ModelDefinitionRequest = { provider: 'anthropic', modelId: '', displayName: '', supportsVision: true, isEnabled: true }

function ModelsTab() {
  const api = useApi()
  const [models, setModels] = useState<AdminModel[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminModel | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      setModels(await api.admin.models())
      setError(null)
    } catch (e) {
      setError(errorText(e))
    }
  }, [api])
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- async fetch; setState only runs after the await
    void load()
  }, [load])

  const toggle = async (m: AdminModel) => {
    try {
      await api.admin.updateModel(m.id, { ...m, isEnabled: !m.isEnabled })
      await load()
    } catch (e) {
      setError(errorText(e))
    }
  }
  const remove = async (m: AdminModel) => {
    if (!confirm(`Delete model "${m.displayName}"?`)) return
    try {
      await api.admin.deleteModel(m.id)
      await load()
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? `"${m.displayName}" is referenced by personas; disable it instead.` : errorText(e))
    }
  }

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">Models available in the persona picker.</p>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}>
          <Plus data-icon="inline-start" />
          Add model
        </Button>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <table className="w-full text-sm">
        <thead className="text-muted-foreground text-left text-xs">
          <tr>
            <th className="py-1 pr-3 font-medium">Name</th>
            <th className="py-1 pr-3 font-medium">Provider / id</th>
            <th className="py-1 pr-3 font-medium">Vision</th>
            <th className="py-1 pr-3 font-medium">Enabled</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {models?.map((m) => (
            <tr key={m.id} className="border-t">
              <td className="py-2 pr-3">{m.displayName}</td>
              <td className="text-muted-foreground py-2 pr-3 font-mono text-xs">{m.provider}/{m.modelId}</td>
              <td className="py-2 pr-3">{m.supportsVision ? 'yes' : 'no'}</td>
              <td className="py-2 pr-3">
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" className="accent-primary size-4" checked={m.isEnabled} onChange={() => toggle(m)} />
                  {m.isEnabled ? 'on' : 'off'}
                </label>
              </td>
              <td className="py-2 text-right whitespace-nowrap">
                <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => { setEditing(m); setOpen(true) }}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => remove(m)}>
                  <Trash2 />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {models?.length === 0 && <p className="text-muted-foreground text-sm">No models defined.</p>}
      <ModelDialog open={open} onOpenChange={setOpen} model={editing} onSaved={() => void load()} />
    </section>
  )
}

function ModelDialog({ open, onOpenChange, model, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; model: AdminModel | null; onSaved: () => void }) {
  const [dirty, setDirty] = useState(false)
  return (
    <Dialog open={open} onOpenChange={guardedClose(() => dirty, onOpenChange)} disablePointerDismissal>
      {/* Keyed so each opening starts from the given model's values via the state initialiser. */}
      {open && <ModelForm key={model?.id ?? 'new'} model={model} onSaved={onSaved} onOpenChange={onOpenChange} onDirtyChange={setDirty} />}
    </Dialog>
  )
}

function ModelForm({ model, onSaved, onOpenChange, onDirtyChange }: { model: AdminModel | null; onSaved: () => void; onOpenChange: (o: boolean) => void; onDirtyChange: (dirty: boolean) => void }) {
  const api = useApi()
  const initial = useMemo<ModelDefinitionRequest>(
    () => (model ? { provider: model.provider, modelId: model.modelId, displayName: model.displayName, supportsVision: model.supportsVision, isEnabled: model.isEnabled } : emptyModel),
    [model],
  )
  const [value, setValue] = useState<ModelDefinitionRequest>(initial)
  useEffect(() => {
    onDirtyChange(JSON.stringify(value) !== JSON.stringify(initial))
  }, [value, initial, onDirtyChange])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof ModelDefinitionRequest>(k: K, v: ModelDefinitionRequest[K]) => setValue({ ...value, [k]: v })
  const valid = value.provider.trim() && value.modelId.trim() && value.displayName.trim()

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      if (model) await api.admin.updateModel(model.id, value)
      else await api.admin.createModel(value)
      onSaved()
      onOpenChange(false)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{model ? 'Edit model' : 'Add model'}</DialogTitle>
          <DialogDescription>The provider key must match a registered chat provider (currently "anthropic").</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="m-name">Display name</Label>
            <Input id="m-name" value={value.displayName} onChange={(e) => set('displayName', e.target.value)} placeholder="Claude Opus 5.5" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="m-provider">Provider</Label>
              <select id="m-provider" className={selectClass} value={value.provider} onChange={(e) => set('provider', e.target.value)}>
                <option value="anthropic">anthropic</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="m-id">Model id</Label>
              <Input id="m-id" value={value.modelId} onChange={(e) => set('modelId', e.target.value)} placeholder="claude-opus-5-5" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-primary size-4" checked={value.supportsVision} onChange={(e) => set('supportsVision', e.target.checked)} />
            Supports images
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-primary size-4" checked={value.isEnabled} onChange={(e) => set('isEnabled', e.target.checked)} />
            Enabled
          </label>
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || !valid}>{model ? 'Save' : 'Add'}</Button>
        </DialogFooter>
      </DialogContent>
  )
}

// ----------------------------------------------------------------- usage

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days < 30 ? `${days} d ago` : new Date(iso).toLocaleDateString()
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function UsageTab() {
  const api = useApi()
  const [from, setFrom] = useState(() => isoDate(new Date(Date.now() - 30 * 86400_000)))
  const [to, setTo] = useState(() => isoDate(new Date()))
  const [rows, setRows] = useState<UsageRow[] | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      // `to` is exclusive on the API, so include the whole selected end day.
      const end = new Date(to)
      end.setDate(end.getDate() + 1)
      const [usage, u] = await Promise.all([api.admin.usage(from, isoDate(end)), api.admin.users()])
      setRows(usage.rows)
      setUsers(u)
      setError(null)
    } catch (e) {
      setError(errorText(e))
    }
  }, [api, from, to])
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- async fetch; setState only runs after the await
    void load()
  }, [load])

  const nameOf = useMemo(() => {
    const map = new Map(users.filter((u) => u.profileId).map((u) => [u.profileId!, u.displayName ?? u.userName]))
    return (id: string) => map.get(id) ?? id.slice(0, 8)
  }, [users])

  const totals = useMemo(() => {
    const t = { requests: 0, tokensIn: 0, tokensOut: 0, units: 0 }
    for (const r of rows ?? []) {
      t.requests += r.requests
      t.tokensIn += r.tokensIn
      t.tokensOut += r.tokensOut
      t.units += r.units
    }
    return t
  }, [rows])

  const fmt = (n: number) => n.toLocaleString()

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="u-from">From</Label>
          <Input id="u-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="u-to">To</Label>
          <Input id="u-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <p className="text-muted-foreground text-sm">
          {fmt(totals.requests)} requests · {fmt(totals.tokensIn)} in / {fmt(totals.tokensOut)} out tokens · {fmt(totals.units)} units
        </p>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <table className="w-full text-sm">
        <thead className="text-muted-foreground text-left text-xs">
          <tr>
            <th className="py-1 pr-3 font-medium">User</th>
            <th className="py-1 pr-3 font-medium">Kind</th>
            <th className="py-1 pr-3 font-medium">Provider / model</th>
            <th className="py-1 pr-3 text-right font-medium">Requests</th>
            <th className="py-1 pr-3 text-right font-medium">Tokens in</th>
            <th className="py-1 pr-3 text-right font-medium">Tokens out</th>
            <th className="py-1 text-right font-medium">Units</th>
          </tr>
        </thead>
        <tbody>
          {rows?.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="py-1.5 pr-3">{nameOf(r.userId)}</td>
              <td className="py-1.5 pr-3">{r.kind}</td>
              <td className="text-muted-foreground py-1.5 pr-3 font-mono text-xs">{r.provider}/{r.modelOrVoiceId}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(r.requests)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(r.tokensIn)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(r.tokensOut)}</td>
              <td className="py-1.5 text-right tabular-nums">{fmt(r.units)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows?.length === 0 && <p className="text-muted-foreground text-sm">No usage in this range.</p>}
      <p className="text-muted-foreground text-xs">Units are images generated or characters synthesised.</p>
    </section>
  )
}

// ----------------------------------------------------------------- users

function UsersTab() {
  const api = useApi()
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.admin.users()
      .then((u) => {
        if (!cancelled) {
          setUsers(u)
          setError(null)
        }
      })
      .catch((e) => {
        if (!cancelled) setError(errorText(e))
      })
    return () => {
      cancelled = true
    }
  }, [api])

  return (
    <section className="grid gap-3">
      <p className="text-muted-foreground text-sm">Accounts provisioned by Authentik via SCIM. "First seen" is the first sign-in to JoChat.</p>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <table className="w-full text-sm">
        <thead className="text-muted-foreground text-left text-xs">
          <tr>
            <th className="py-1 pr-3 font-medium">Username</th>
            <th className="py-1 pr-3 font-medium">Display name</th>
            <th className="py-1 pr-3 font-medium">Active</th>
            <th className="py-1 pr-3 font-medium">Role</th>
            <th className="py-1 pr-3 font-medium">First seen</th>
            <th className="py-1 font-medium">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {users?.map((u) => (
            <tr key={u.scimUserId} className="border-t">
              <td className="py-1.5 pr-3">{u.userName}</td>
              <td className="py-1.5 pr-3">{u.displayName ?? <span className="text-muted-foreground">—</span>}</td>
              <td className="py-1.5 pr-3">{u.active ? 'yes' : 'no'}</td>
              <td className="py-1.5 pr-3">
                {u.isAdmin ? 'admin' : u.hasAccess ? 'user' : <span className="text-muted-foreground">no access</span>}
              </td>
              <td className="py-1.5 pr-3">{u.firstSeen ? new Date(u.firstSeen).toLocaleDateString() : <span className="text-muted-foreground">never signed in</span>}</td>
              <td className="py-1.5" title={u.lastSeen ?? undefined}>{u.lastSeen ? relativeTime(u.lastSeen) : <span className="text-muted-foreground">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
