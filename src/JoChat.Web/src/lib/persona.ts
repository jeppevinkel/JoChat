import type { ModelDefinition, Persona, PersonaRequest } from './api'

export const selectClass =
  'border-input bg-background h-8 w-full rounded-md border px-2 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-50'

export function emptyPersona(models: ModelDefinition[]): PersonaRequest {
  const m = models[0]
  return {
    name: '',
    description: null,
    systemPrompt: '',
    provider: m?.provider ?? '',
    modelId: m?.modelId ?? '',
    temperature: null,
    maxTokens: null,
    defaultTtsProvider: null,
    defaultTtsVoiceId: null,
    isShared: false,
  }
}

export function toRequest(p: Persona): PersonaRequest {
  return {
    name: p.name,
    description: p.description,
    systemPrompt: p.systemPrompt,
    provider: p.provider,
    modelId: p.modelId,
    temperature: p.temperature,
    maxTokens: p.maxTokens,
    defaultTtsProvider: p.defaultTtsProvider,
    defaultTtsVoiceId: p.defaultTtsVoiceId,
    isShared: p.isShared,
  }
}

export function isValidPersona(v: PersonaRequest): boolean {
  return v.name.trim().length > 0 && v.provider !== '' && v.modelId !== '' && (v.maxTokens == null || v.maxTokens > 0)
}
