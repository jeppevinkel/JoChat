import { useAuth } from 'react-oidc-context'
import { useLayoutEffect, useRef, useState } from 'react'
import { readSse } from './sse'

export interface ChatSummary {
  id: string
  title: string
  personaId: string
  personaName: string
  personaModelId: string
  isShared: boolean
  updatedAt: string
}

export interface ShareInfo {
  token: string
  allowAnonymous: boolean
  createdAt: string
}

export interface SharedMessage {
  id: string
  role: 'User' | 'Assistant'
  content: string
  createdAt: string
  attachments: AttachmentRef[]
  toolActivity: ToolStep[] | null
}

export interface SharedChat {
  title: string
  allowAnonymous: boolean
  ownerName: string | null
  persona: { name: string; description: string | null; modelId: string } | null
  messages: SharedMessage[]
}

export interface AttachmentRef {
  id: string
  kind: 'UploadedImage' | 'GeneratedImage' | 'TtsAudio' | 'GeneratedFile'
  mimeType: string
  fileName: string | null
  sizeBytes: number
  width: number | null
  height: number | null
}

export interface ToolStep {
  kind: 'use' | 'result'
  tool: string
  label: string
  isError: boolean
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
  toolActivity: ToolStep[] | null
}

export interface Persona {
  id: string
  name: string
  description: string | null
  systemPrompt: string
  provider: string
  modelId: string
  temperature: number | null
  maxTokens: number | null
  defaultTtsProvider: string | null
  defaultTtsVoiceId: string | null
  enableWebSearch: boolean
  enableWebFetch: boolean
  enableCodeExecution: boolean
  isShared: boolean
  isOwner: boolean
  updatedAt: string
}

export interface PersonaRequest {
  name: string
  description: string | null
  systemPrompt: string
  provider: string
  modelId: string
  temperature: number | null
  maxTokens: number | null
  defaultTtsProvider: string | null
  defaultTtsVoiceId: string | null
  enableWebSearch: boolean
  enableWebFetch: boolean
  enableCodeExecution: boolean
  isShared: boolean
}

export interface TtsVoice {
  id: string
  name: string
  previewUrl: string | null
}

export interface ModelDefinition {
  id: string
  provider: string
  modelId: string
  displayName: string
  supportsVision: boolean
}

export interface AdminModel {
  id: string
  provider: string
  modelId: string
  displayName: string
  supportsVision: boolean
  isEnabled: boolean
}

export interface ModelDefinitionRequest {
  provider: string
  modelId: string
  displayName: string
  supportsVision: boolean
  isEnabled: boolean
}

export interface UsageRow {
  userId: string
  provider: string
  modelOrVoiceId: string
  kind: string
  requests: number
  tokensIn: number
  tokensOut: number
  units: number
}

export interface AdminUser {
  scimUserId: string
  externalId: string
  userName: string
  active: boolean
  profileId: string | null
  displayName: string | null
  firstSeen: string | null
  lastSeen: string | null
  hasAccess: boolean
  isAdmin: boolean
  chats: number
  messagesSent: number
  personas: number
  lastChatAt: string | null
}

/** Any user's persona, private ones included (admin moderation view). */
export interface AdminPersona {
  id: string
  ownerId: string
  name: string
  description: string | null
  systemPrompt: string
  provider: string
  modelId: string
  maxTokens: number | null
  enableWebSearch: boolean
  enableWebFetch: boolean
  enableCodeExecution: boolean
  isShared: boolean
  updatedAt: string
  chats: number
}

export interface AdminChatRow {
  id: string
  title: string
  ownerId: string
  createdAt: string
  updatedAt: string
  personaName: string
  personaModelId: string
  messages: number
  isShared: boolean
  /** Excerpt around the first match when searching. */
  snippet: string | null
}

export interface AdminChatQuery {
  userId?: string
  q?: string
  from?: string
  to?: string
  page?: number
}

export interface AdminChat {
  id: string
  title: string
  ownerId: string
  createdAt: string
  updatedAt: string
  isShared: boolean
  persona: { id: string; name: string; description: string | null; modelId: string; systemPrompt: string } | null
  messages: SharedMessage[]
}

export interface AuditEntry {
  id: string
  adminId: string
  action: 'view_chat' | 'search_messages'
  targetUserId: string | null
  chatId: string | null
  detail: string | null
  createdAt: string
  chatExists: boolean
}

export interface Page<T> {
  total: number
  page: number
  pageSize: number
  items: T[]
}

export interface Me {
  id: string
  displayName: string | null
  defaultPersonaId: string | null
  roles: string[]
}

export type ChatStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool: string; label: string }
  | { type: 'tool_result'; tool: string; label: string; isError: boolean }
  | { type: 'completed'; tokensIn: number; tokensOut: number; stopReason: string }
  | { type: 'error'; message: string }
  // First event when the message starts a new chat: the chat now exists under this id.
  | { type: 'chat_created'; chatId: string }

const STREAM_EVENTS = new Set(['text', 'tool_use', 'tool_result', 'completed', 'error', 'chat_created'])

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

async function* streamEvents(
  url: string,
  body: unknown,
  authHeaders: Record<string, string>,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
  await throwIfFailed(res)
  for await (const evt of readSse(res)) {
    const data = JSON.parse(evt.data)
    if (STREAM_EVENTS.has(evt.event)) {
      yield { type: evt.event, ...data } as ChatStreamEvent
    }
  }
}

export function createApi(getToken: () => string | undefined) {
  // No Authorization header at all when signed out, so anonymous endpoints see a clean request.
  const headers = (extra: Record<string, string> = {}): Record<string, string> => {
    const token = getToken()
    return token ? { Authorization: `Bearer ${token}`, ...extra } : { ...extra }
  }
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
    setDefaultPersona: (personaId: string | null) =>
      json<void>('/me', {
        method: 'PATCH',
        body: JSON.stringify(personaId ? { defaultPersonaId: personaId } : { clearDefaultPersona: true }),
      }),
    models: () => json<ModelDefinition[]>('/models'),
    personas: () => json<Persona[]>('/personas'),
    createPersona: (body: PersonaRequest) =>
      json<Persona>('/personas', { method: 'POST', body: JSON.stringify(body) }),
    updatePersona: (id: string, body: PersonaRequest) =>
      json<Persona>(`/personas/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    deletePersona: (id: string) => json<void>(`/personas/${id}`, { method: 'DELETE' }),
    ttsVoices: (provider: string) => json<TtsVoice[]>(`/tts/voices?provider=${encodeURIComponent(provider)}`),
    chats: () => json<ChatSummary[]>('/chats'),
    deleteChat: (id: string) => json<void>(`/chats/${id}`, { method: 'DELETE' }),
    messages: (chatId: string) => json<Message[]>(`/chats/${chatId}/messages`),
    updateMessage: (chatId: string, messageId: string, content: string) =>
      json<{ id: string; content: string }>(`/chats/${chatId}/messages/${messageId}`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      }),
    deleteMessage: (chatId: string, messageId: string) =>
      json<void>(`/chats/${chatId}/messages/${messageId}`, { method: 'DELETE' }),

    // With personaId instead of chatId the image starts a new chat (returned as chatId).
    generateImage: (body: { prompt: string; chatId?: string; personaId?: string; provider?: string; size?: string; quality?: string }) =>
      json<{ id: string; url: string; mimeType: string; messageId: string | null; chatId: string | null }>('/images/generate', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    // Returns an object URL for the synthesized audio. With messageId the server caches the
    // audio on the message, so later calls (or attachmentBlobUrl on the TtsAudio attachment) are free.
    speak: async (body: { messageId: string; provider: string; voiceId: string; modelId?: string }): Promise<string> => {
      const res = await fetch('/api/tts/speak', {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      })
      await throwIfFailed(res)
      return URL.createObjectURL(await res.blob())
    },

    admin: {
      models: () => json<AdminModel[]>('/admin/models'),
      createModel: (body: ModelDefinitionRequest) =>
        json<AdminModel>('/admin/models', { method: 'POST', body: JSON.stringify(body) }),
      updateModel: (id: string, body: ModelDefinitionRequest) =>
        json<AdminModel>(`/admin/models/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
      deleteModel: (id: string) => json<void>(`/admin/models/${id}`, { method: 'DELETE' }),
      usage: (from: string, to: string) =>
        json<{ from: string; to: string; rows: UsageRow[] }>(
          `/admin/usage?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        ),
      users: () => json<AdminUser[]>('/admin/users'),
      personas: (userId?: string) =>
        json<AdminPersona[]>(`/admin/personas${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`),
      // Searching (q) and opening a chat are recorded in the admin audit log.
      chats: (query: AdminChatQuery) => {
        const params = new URLSearchParams()
        for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') params.set(k, String(v))
        return json<Page<AdminChatRow>>(`/admin/chats?${params}`)
      },
      chat: (id: string) => json<AdminChat>(`/admin/chats/${id}`),
      attachmentBlobUrl: async (id: string): Promise<string> => {
        const res = await fetch(`/api/admin/attachments/${id}`, { headers: headers() })
        await throwIfFailed(res)
        return URL.createObjectURL(await res.blob())
      },
      audit: (page = 1) => json<Page<AuditEntry>>(`/admin/audit?page=${page}`),
    },

    share: {
      get: (chatId: string) => json<ShareInfo | undefined>(`/chats/${chatId}/share`),
      set: (chatId: string, allowAnonymous: boolean) =>
        json<ShareInfo>(`/chats/${chatId}/share`, { method: 'PUT', body: JSON.stringify({ allowAnonymous }) }),
      revoke: (chatId: string) => json<void>(`/chats/${chatId}/share`, { method: 'DELETE' }),
      // Viewer side (works signed out when the share allows it).
      view: (token: string) => json<SharedChat>(`/shares/${encodeURIComponent(token)}`),
      attachmentBlobUrl: async (token: string, id: string): Promise<string> => {
        const res = await fetch(`/api/shares/${encodeURIComponent(token)}/attachments/${id}`, { headers: headers() })
        await throwIfFailed(res)
        return URL.createObjectURL(await res.blob())
      },
      clone: (token: string, personaId?: string) =>
        json<{ id: string }>(`/shares/${encodeURIComponent(token)}/clone`, {
          method: 'POST',
          body: JSON.stringify({ personaId: personaId ?? null }),
        }),
    },

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

    sendMessage: (chatId: string, text: string, attachmentIds: string[], signal?: AbortSignal) =>
      streamEvents(`/api/chats/${chatId}/messages`, { text, attachmentIds }, headers(), signal),

    // Creates the chat together with its first message; the stream opens with chat_created.
    startChat: (personaId: string, text: string, attachmentIds: string[], signal?: AbortSignal) =>
      streamEvents('/api/chats/start', { personaId, text, attachmentIds }, headers(), signal),

    regenerate: (chatId: string, messageId: string, signal?: AbortSignal) =>
      streamEvents(`/api/chats/${chatId}/messages/${messageId}/regenerate`, undefined, headers(), signal),
  }
}

export type Api = ReturnType<typeof createApi>

// One client per component for its whole lifetime, reading the current token at request time.
// Rebuilding it per token made every silent renewal (every few minutes) look like a dependency
// change to effects keyed on the api: forms reset, and an open empty chat was deleted as if left.
export function useApi(): Api {
  const auth = useAuth()
  const tokenRef = useRef(auth.user?.access_token)
  useLayoutEffect(() => {
    tokenRef.current = auth.user?.access_token
  }, [auth.user])
  // oxlint-disable-next-line react/refs -- read lazily when a request is made, not during render
  const [api] = useState(() => createApi(() => tokenRef.current))
  return api
}
