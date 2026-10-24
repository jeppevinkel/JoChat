import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
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
import { Textarea } from '@/components/ui/textarea'
import { useApi, type ModelDefinition, type Persona } from '@/lib/api'
import { useChats } from '@/lib/use-chats'

const selectClass =
  'border-input bg-background h-8 w-full rounded-md border px-2 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none'

export function NewChatDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const api = useApi()
  const navigate = useNavigate()
  const { refresh } = useChats()
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [models, setModels] = useState<ModelDefinition[]>([])
  const [personaId, setPersonaId] = useState('')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Inline persona form — there's no persona page yet and a chat can't exist without one.
  const [name, setName] = useState('')
  const [modelKey, setModelKey] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')

  useEffect(() => {
    if (!open) return
    Promise.all([api.personas(), api.models()])
      .then(([p, m]) => {
        setError(null)
        setPersonas(p)
        setModels(m)
        setPersonaId((cur) => cur || p[0]?.id || '')
        setModelKey((cur) => cur || (m[0] ? `${m[0].provider}/${m[0].modelId}` : ''))
        setCreating(p.length === 0)
      })
      .catch((e) => setError(e.message))
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

  const createPersonaAndStart = async () => {
    const [provider, modelId] = modelKey.split('/')
    setBusy(true)
    setError(null)
    try {
      const persona = await api.createPersona({ name, systemPrompt, provider, modelId, isShared: false })
      setPersonas((p) => [...(p ?? []), persona])
      await start(persona.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New chat</DialogTitle>
          <DialogDescription>
            {creating ? 'Create a persona to chat with.' : 'Pick the persona for this conversation.'}
          </DialogDescription>
        </DialogHeader>

        {creating ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="persona-name">Name</Label>
              <Input id="persona-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Assistant" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="persona-model">Model</Label>
              <select id="persona-model" className={selectClass} value={modelKey} onChange={(e) => setModelKey(e.target.value)}>
                {models.map((m) => (
                  <option key={m.id} value={`${m.provider}/${m.modelId}`}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="persona-prompt">System prompt</Label>
              <Textarea
                id="persona-prompt"
                rows={5}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="You are a helpful assistant."
              />
            </div>
          </div>
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
          </div>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}

        <DialogFooter>
          {personas && personas.length > 0 && (
            <Button variant="ghost" onClick={() => setCreating((c) => !c)} disabled={busy}>
              {creating ? 'Choose existing' : 'New persona'}
            </Button>
          )}
          {creating ? (
            <Button onClick={createPersonaAndStart} disabled={busy || !name.trim() || !modelKey}>
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
