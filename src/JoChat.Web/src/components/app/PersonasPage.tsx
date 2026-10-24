import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApiError, useApi, type Persona } from '@/lib/api'
import { PersonaDialog } from './PersonaDialog'

export default function PersonasPage() {
  const api = useApi()
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Persona | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      setPersonas(await api.personas())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- async fetch; setState only runs after the await
    void load()
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (p: Persona) => {
    setEditing(p)
    setDialogOpen(true)
  }
  const remove = async (p: Persona) => {
    if (!confirm(`Delete persona "${p.name}"?`)) return
    try {
      await api.deletePersona(p.id)
      await load()
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? `"${p.name}" is used by existing chats and can't be deleted.` : String(e))
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-xl font-semibold">Personas</h1>
          <Button size="sm" onClick={openCreate}>
            <Plus data-icon="inline-start" />
            New persona
          </Button>
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        {personas === null && !error && <p className="text-muted-foreground text-sm">Loading…</p>}
        {personas?.length === 0 && <p className="text-muted-foreground text-sm">No personas yet. Create one to start chatting.</p>}
        <ul className="grid gap-3">
          {personas?.map((p) => (
            <li key={p.id} className="bg-card text-card-foreground rounded-xl border p-4 shadow-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{p.name}</span>
                    {p.isShared && (
                      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs" title="Shared">
                        <Users className="size-3" />
                        {p.isOwner ? 'shared' : 'shared with you'}
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {p.provider}/{p.modelId}
                    {p.maxTokens ? ` · ${p.maxTokens} tokens` : ''}
                    {p.defaultTtsProvider ? ` · voice: ${p.defaultTtsProvider}` : ''}
                  </p>
                  {p.description && <p className="mt-1 text-sm">{p.description}</p>}
                  <p className="text-muted-foreground mt-2 line-clamp-3 text-xs whitespace-pre-wrap">{p.systemPrompt}</p>
                </div>
                {p.isOwner && (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => openEdit(p)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => remove(p)}>
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <PersonaDialog open={dialogOpen} onOpenChange={setDialogOpen} persona={editing} onSaved={() => void load()} />
    </div>
  )
}
