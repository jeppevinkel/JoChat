import { useAuth } from 'react-oidc-context'
import { useMemo } from 'react'
import { readSse } from './sse'

export interface ChatSummary {
  id: string
  title: string
  personaId: string
  updatedAt: string
}

export interface AttachmentRef {
  id: string
  kind: 'UploadedImage' | 'GeneratedImage' | 'TtsAudio'
  mimeType: string
  width: number | null
  height: number | null
}

export interface Message {
  id: string
  parentMessageId: string | null
  role: 'User' | 'Assistant'
  content: string
  tokensIn: number | null
  tokensOut: number | null
  createdAt: string
  attachments: AttachmentRef[]
}

export interface Persona {
  id: string
  name: string
  description: string | null
  systemPrompt: string
  provider: string
  modelId: string
  maxTokens: number | null
  isShared: boolean
  isOwner: boolean
}

export interface ModelDefinition {
  id: string
  provider: string
  modelId: string
  displayName: string
  supportsVision: boolean
}

export interface Me {
  id: string
  displayName: string | null
  defaultPersonaId: string | null
  roles: string[]
}

export type ChatStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'completed'; tokensIn: number; tokensOut: number; stopReason: string }
  | { type: 'error'; message: string }

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function throwIfFailed(res: Response): Promise<void> {
  if (res.ok) return
  let detail = res.statusText
  try {
    const body = await res.json()
    detail = body.detail ?? body.title ?? detail
  } catch {
    // not a problem+json body
  }
  throw new ApiError(res.status, detail)
}

export function createApi(getToken: () => string | undefined) {
  const headers = (extra: Record<string, string> = {}) => ({
    Authorization: `Bearer ${getToken() ?? ''}`,
    ...extra,
  })
  const json = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const res = await fetch(`/api${path}`, {
      ...init,
      headers: headers({ 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) }),
    })
    await throwIfFailed(res)
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
  }

  return {
    me: () => json<Me>('/me'),
    models: () => json<ModelDefinition[]>('/models'),
    personas: () => json<Persona[]>('/personas'),
    createPersona: (body: {
      name: string
      systemPrompt: string
      provider: string
      modelId: string
      isShared: boolean
      description?: string | null
      maxTokens?: number | null
    }) => json<Persona>('/personas', { method: 'POST', body: JSON.stringify(body) }),
    chats: () => json<ChatSummary[]>('/chats'),
    createChat: (personaId: string) =>
      json<{ id: string }>('/chats', { method: 'POST', body: JSON.stringify({ personaId }) }),
    deleteChat: (id: string) => json<void>(`/chats/${id}`, { method: 'DELETE' }),
    messages: (chatId: string) => json<Message[]>(`/chats/${chatId}/messages`),

    uploadAttachment: async (file: File): Promise<{ id: string; mimeType: string }> => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/attachments', { method: 'POST', headers: headers(), body: form })
      await throwIfFailed(res)
      return res.json()
    },

    // Attachments need the bearer header, so <img src> can't load them directly.
    attachmentBlobUrl: async (id: string): Promise<string> => {
      const res = await fetch(`/api/attachments/${id}`, { headers: headers() })
      await throwIfFailed(res)
      return URL.createObjectURL(await res.blob())
    },

    sendMessage: async function* (
      chatId: string,
      text: string,
      attachmentIds: string[],
      signal?: AbortSignal,
    ): AsyncGenerator<ChatStreamEvent> {
      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json', Accept: 'text/event-stream' }),
        body: JSON.stringify({ text, attachmentIds }),
        signal,
      })
      await throwIfFailed(res)
      for await (const evt of readSse(res)) {
        const data = JSON.parse(evt.data)
        if (evt.event === 'text' || evt.event === 'completed' || evt.event === 'error') {
          yield { type: evt.event, ...data } as ChatStreamEvent
        }
      }
    },
  }
}

export type Api = ReturnType<typeof createApi>

export function useApi(): Api {
  const auth = useAuth()
  const token = auth.user?.access_token
  return useMemo(() => createApi(() => token), [token])
}
