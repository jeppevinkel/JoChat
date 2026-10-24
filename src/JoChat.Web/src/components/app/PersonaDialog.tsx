import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useApi, type ModelDefinition, type Persona, type PersonaRequest } from '@/lib/api'
import { emptyPersona, isValidPersona, toRequest } from '@/lib/persona'
import { guardedClose } from '@/lib/guarded-close'
import { PersonaForm } from './PersonaForm'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  persona: Persona | null // null = create
  onSaved: (p: Persona) => void
}

export function PersonaDialog({ open, onOpenChange, persona, onSaved }: Props) {
  const api = useApi()
  const [models, setModels] = useState<ModelDefinition[]>([])
  const [value, setValue] = useState<PersonaRequest | null>(null)
  const [initial, setInitial] = useState<PersonaRequest | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    api
      .models()
      .then((m) => {
        if (cancelled) return
        setModels(m)
        const start = persona ? toRequest(persona) : emptyPersona(m)
        setValue(start)
        setInitial(start)
        setError(null)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [open, api, persona])

  const save = async () => {
    if (!value) return
    setBusy(true)
    setError(null)
    try {
      const saved = persona ? await api.updatePersona(persona.id, value) : await api.createPersona(value)
      onSaved(saved)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const isDirty = () => value !== null && initial !== null && JSON.stringify(value) !== JSON.stringify(initial)

  return (
    <Dialog open={open} onOpenChange={guardedClose(isDirty, onOpenChange)} disablePointerDismissal>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{persona ? 'Edit persona' : 'New persona'}</DialogTitle>
          <DialogDescription>System prompt, model and defaults for chats using this persona.</DialogDescription>
        </DialogHeader>
        {value ? <PersonaForm value={value} onChange={setValue} models={models} /> : <p className="text-sm">Loading…</p>}
        {error && <p className="text-destructive text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !value || !isValidPersona(value)}>
            {persona ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
