import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useApi, type ModelDefinition, type PersonaRequest, type TtsVoice } from '@/lib/api'
import { selectClass } from '@/lib/persona'

const TTS_PROVIDERS = [
  { id: '', label: 'None' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'elevenlabs', label: 'ElevenLabs' },
]

interface Props {
  value: PersonaRequest
  onChange: (next: PersonaRequest) => void
  models: ModelDefinition[]
  idPrefix?: string
}

// Fields only; the surrounding dialog owns submit/cancel so it can be reused for create and edit.
export function PersonaForm({ value, onChange, models, idPrefix = 'persona' }: Props) {
  const api = useApi()
  const [voices, setVoices] = useState<TtsVoice[]>([])
  const [voicesError, setVoicesError] = useState<string | null>(null)
  const set = <K extends keyof PersonaRequest>(key: K, v: PersonaRequest[K]) => onChange({ ...value, [key]: v })

  const ttsProvider = value.defaultTtsProvider ?? ''
  useEffect(() => {
    if (!ttsProvider) return
    let cancelled = false
    api
      .ttsVoices(ttsProvider)
      .then((v) => {
        if (cancelled) return
        setVoices(v)
        setVoicesError(null)
      })
      .catch((e) => {
        if (!cancelled) setVoicesError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [api, ttsProvider])

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-name`}>Name</Label>
        <Input id={`${idPrefix}-name`} value={value.name} onChange={(e) => set('name', e.target.value)} placeholder="Assistant" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-description`}>Description</Label>
        <Input
          id={`${idPrefix}-description`}
          value={value.description ?? ''}
          onChange={(e) => set('description', e.target.value || null)}
          placeholder="Optional one-liner shown in the picker"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-model`}>Model</Label>
        <select
          id={`${idPrefix}-model`}
          className={selectClass}
          value={`${value.provider}/${value.modelId}`}
          onChange={(e) => {
            const [provider, modelId] = e.target.value.split('/')
            onChange({ ...value, provider, modelId })
          }}
        >
          {models.map((m) => (
            <option key={m.id} value={`${m.provider}/${m.modelId}`}>
              {m.displayName}
              {m.supportsVision ? '' : ' (no images)'}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-prompt`}>System prompt</Label>
        <Textarea
          id={`${idPrefix}-prompt`}
          rows={6}
          value={value.systemPrompt}
          onChange={(e) => set('systemPrompt', e.target.value)}
          placeholder="You are a helpful assistant."
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-max-tokens`}>Max output tokens</Label>
        <Input
          id={`${idPrefix}-max-tokens`}
          type="number"
          min={1}
          value={value.maxTokens ?? ''}
          onChange={(e) => set('maxTokens', e.target.value === '' ? null : Number(e.target.value))}
          placeholder="Provider default"
        />
        <p className="text-muted-foreground text-xs">Includes the model's thinking; keep it comfortably above 1000.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-tts`}>Voice provider</Label>
          <select
            id={`${idPrefix}-tts`}
            className={selectClass}
            value={ttsProvider}
            onChange={(e) => onChange({ ...value, defaultTtsProvider: e.target.value || null, defaultTtsVoiceId: null })}
          >
            {TTS_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-voice`}>Voice</Label>
          <select
            id={`${idPrefix}-voice`}
            className={selectClass}
            value={value.defaultTtsVoiceId ?? ''}
            disabled={!ttsProvider}
            onChange={(e) => set('defaultTtsVoiceId', e.target.value || null)}
          >
            <option value="">{ttsProvider ? 'Choose…' : '—'}</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          {voicesError && <p className="text-destructive text-xs">{voicesError}</p>}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-primary size-4"
          checked={value.isShared}
          onChange={(e) => set('isShared', e.target.checked)}
        />
        Share with other users
      </label>
    </div>
  )
}
