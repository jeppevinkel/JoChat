import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Star, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApiError, useApi, type Persona } from '@/lib/api'
import { useDefaultPersona } from '@/lib/use-me'
import { cn } from '@/lib/utils'
import { PageHeader, PageTitle } from './PageHeader'
import { PersonaDialog } from './PersonaDialog'

export default function PersonasPage() {
  const api = useApi()
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Persona | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const { defaultPersonaId, setDefaultPersona } = useDefaultPersona()

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
      if (p.id === defaultPersonaId) await setDefaultPersona(null)
      await load()
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? `"${p.name}" is used by existing chats and can't be deleted.` : String(e))
    }
  }

  const toggleDefault = async (p: Persona) => {
    try {
      await setDefaultPersona(p.id === defaultPersonaId ? null : p.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <PageHeader>
        <PageTitle>Personas</PageTitle>
        <Button size="sm" onClick={openCreate} className="pointer-coarse:h-9">
          <Plus data-icon="inline-start" />
          New persona
        </Button>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6">
          {error && <p className="text-destructive text-sm">{error}</p>}
          {personas === null && !error && <p className="text-muted-foreground text-sm">Loading…</p>}
          {personas?.length === 0 && <p className="text-muted-foreground text-sm">No personas yet. Create one to start chatting.</p>}
          <ul className="grid gap-3">
            {personas?.map((p) => (
              <li key={p.id} className="bg-card text-card-foreground rounded-xl border p-3 shadow-xs sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-heading truncate text-lg font-semibold">{p.name}</span>
                      {p.id === defaultPersonaId && (
                        <span className="bg-accent-ink/20 text-foreground rounded-sm px-1.5 py-0.5 text-[0.68rem] font-semibold tracking-wider uppercase">Default</span>
                      )}
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
                      {[p.enableWebSearch && 'search', p.enableWebFetch && 'fetch', p.enableCodeExecution && 'code']
                        .filter(Boolean)
                        .map((t) => ` · ${t}`)
                        .join('')}
                    </p>
                    {p.description && <p className="mt-1 text-sm">{p.description}</p>}
                    <p className="text-muted-foreground mt-2 line-clamp-3 text-xs whitespace-pre-wrap">{p.systemPrompt}</p>
                  </div>
                  <div className="-mt-1 -mr-1 flex shrink-0 gap-1">
                    {/* Any usable persona can be the default, including ones shared with you. */}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-pressed={p.id === defaultPersonaId}
                      aria-label={p.id === defaultPersonaId ? 'Stop using as default for new chats' : 'Use as default for new chats'}
                      title={p.id === defaultPersonaId ? 'Default for new chats (click to unset)' : 'Use as default for new chats'}
                      onClick={() => void toggleDefault(p)}
                    >
                      <Star className={cn(p.id === defaultPersonaId && 'fill-accent-ink text-accent-ink')} />
                    </Button>
                    {p.isOwner && (
                      <>
                        <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => openEdit(p)}>
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => remove(p)}>
                          <Trash2 />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <PersonaDialog open={dialogOpen} onOpenChange={setDialogOpen} persona={editing} onSaved={() => void load()} />
    </>
  )
}
