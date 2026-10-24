import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useApi, type ModelDefinition, type Persona, type PersonaRequest } from '@/lib/api'
import { guardedClose } from '@/lib/guarded-close'
import { useChats } from '@/lib/use-chats'
import { emptyPersona, isValidPersona, selectClass } from '@/lib/persona'
import { PersonaForm } from './PersonaForm'

export function NewChatDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const api = useApi()
  const navigate = useNavigate()
  const { refresh } = useChats()
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [models, setModels] = useState<ModelDefinition[]>([])
  const [personaId, setPersonaId] = useState('')
  const [draft, setDraft] = useState<PersonaRequest | null>(null) // non-null = inline create mode
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    Promise.all([api.personas(), api.models()])
      .then(([p, m]) => {
        if (cancelled) return
        setError(null)
        setPersonas(p)
        setModels(m)
        setPersonaId((cur) => cur || p[0]?.id || '')
        // No personas yet: go straight to the create form, since a chat can't exist without one.
        setDraft(p.length === 0 ? emptyPersona(m) : null)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [open, api])

  const start = async (id: string) => {
    setBusy(true)
    setError(null)
    try {
      const { id: chatId } = await api.createChat(id)
      await refresh()
      onOpenChange(false)
      navigate(`/chats/${chatId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const createAndStart = async () => {
    if (!draft) return
    setBusy(true)
    setError(null)
    try {
      const persona = await api.createPersona(draft)
      setPersonas((p) => [...(p ?? []), persona])
      await start(persona.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  // Only the inline persona form holds anything worth protecting.
  const isDirty = () => draft !== null && JSON.stringify(draft) !== JSON.stringify(emptyPersona(models))

  return (
    <Dialog open={open} onOpenChange={guardedClose(isDirty, onOpenChange)} disablePointerDismissal={draft !== null}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New chat</DialogTitle>
          <DialogDescription>
            {draft ? 'Create a persona to chat with.' : 'Pick the persona for this conversation.'}
          </DialogDescription>
        </DialogHeader>

        {draft ? (
          <PersonaForm value={draft} onChange={setDraft} models={models} idPrefix="new-chat-persona" />
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor="persona">Persona</Label>
            <select id="persona" className={selectClass} value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
              {personas?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.modelId}
                  {p.isShared && !p.isOwner ? ' (shared)' : ''}
                </option>
              ))}
            </select>
            <Link to="/personas" className="text-muted-foreground text-xs underline" onClick={() => onOpenChange(false)}>
              Manage personas
            </Link>
          </div>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}

        <DialogFooter>
          {personas && personas.length > 0 && (
            <Button variant="ghost" onClick={() => setDraft((d) => (d ? null : emptyPersona(models)))} disabled={busy}>
              {draft ? 'Choose existing' : 'New persona'}
            </Button>
          )}
          {draft ? (
            <Button onClick={createAndStart} disabled={busy || !isValidPersona(draft)}>
              Create & start
            </Button>
          ) : (
            <Button onClick={() => start(personaId)} disabled={busy || !personaId}>
              Start chat
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
