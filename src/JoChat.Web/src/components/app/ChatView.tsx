import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type TouchEvent, type UIEvent, type WheelEvent } from 'react'
import { useParams } from 'react-router'
import { ArrowDown, ImagePlus, SendHorizontal, Sparkles, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useApi, type ChatStreamEvent } from '@/lib/api'
import { useChats } from '@/lib/use-chats'
import { MessageBubble, type DisplayMessage, type MessageActions, type TtsDefaults } from './MessageBubble'

interface PendingUpload {
  file: File
  previewUrl: string
  id?: string
  error?: string
}

// Re-attach to auto-scroll only when genuinely at the bottom (px); detaching is driven by
// user intent (wheel/touch/keys) so it wins even while content is streaming in fast.
const REATTACH_THRESHOLD = 16

// Keyed by chat id so switching chats remounts with fresh state instead of resetting in an effect.
export function ChatView() {
  const { id } = useParams<{ id: string }>()
  if (!id) return null
  return <ChatPane key={id} chatId={id} />
}

function ChatPane({ chatId }: { chatId: string }) {
  const api = useApi()
  const { chats, refresh } = useChats()
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [tts, setTts] = useState<TtsDefaults | null>(null)
  const [imageMode, setImageMode] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [uploads, setUploads] = useState<PendingUpload[]>([])
  const [streaming, setStreaming] = useState(false)
  const [attached, setAttachedState] = useState(true)
  const attachedRef = useRef(true) // read by the auto-scroll effect without waiting for a render
  const setAttached = (v: boolean) => {
    attachedRef.current = v
    setAttachedState(v)
  }
  const loadedRef = useRef(false)
  const streamingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const touchYRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Mirrors of state for the unmount cleanup, which can't read current state directly.
  const messagesRef = useRef<DisplayMessage[]>([])
  useEffect(() => {
    messagesRef.current = messages
    streamingRef.current = streaming
  }, [messages, streaming])

  const load = useCallback(async () => {
    try {
      const list = await api.messages(chatId)
      setMessages(list.map((m) => ({ id: m.id, role: m.role, content: m.content, attachments: m.attachments })))
      setLoadError(null)
      loadedRef.current = true
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }, [api, chatId])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- async fetch; setState only runs after the await
    void load()
    return () => {
      abortRef.current?.abort()
      // A chat that was opened but never used is just clutter: drop it on the way out.
      if (loadedRef.current && messagesRef.current.length === 0 && !streamingRef.current) {
        api.deleteChat(chatId).then(() => refresh()).catch(() => {})
      }
    }
  }, [load, api, chatId, refresh])

  // Auto-scroll follows new content only while attached. Detaching is decided from user
  // intent (wheel up, touch drag down, PageUp/ArrowUp/Home) rather than from the resulting
  // scroll position, so it takes effect immediately even while the reply streams in fast;
  // re-attaching happens when the user actually reaches the bottom (or sends a message).
  const scrollToBottom = (behavior: ScrollBehavior = 'auto') =>
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior })
  useEffect(() => {
    if (attachedRef.current) scrollToBottom()
  }, [messages])
  const detach = () => {
    if (attachedRef.current) setAttached(false)
  }
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < 0) detach()
  }
  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    touchYRef.current = e.touches[0]?.clientY ?? null
  }
  const onTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    const y = e.touches[0]?.clientY
    if (y !== undefined && touchYRef.current !== null && y > touchYRef.current + 4) detach()
  }
  const onScrollKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Home') detach()
  }
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distance <= REATTACH_THRESHOLD) {
      if (!attachedRef.current) setAttached(true)
    } else if (attachedRef.current && !streamingRef.current) {
      // Scrollbar drag or similar while idle: the position alone is enough to detach.
      setAttached(false)
    }
  }

  // Read-aloud uses the persona's configured voice; without one the button stays hidden.
  const personaId = chats.find((c) => c.id === chatId)?.personaId
  useEffect(() => {
    if (!personaId) return
    let cancelled = false
    api
      .personas()
      .then((list) => {
        if (cancelled) return
        const p = list.find((x) => x.id === personaId)
        setTts(p?.defaultTtsProvider && p.defaultTtsVoiceId ? { provider: p.defaultTtsProvider, voiceId: p.defaultTtsVoiceId } : null)
      })
      .catch(() => {
        if (!cancelled) setTts(null)
      })
    return () => {
      cancelled = true
    }
  }, [api, personaId])

  const addFiles = (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      const pending: PendingUpload = { file, previewUrl: URL.createObjectURL(file) }
      setUploads((u) => [...u, pending])
      api
        .uploadAttachment(file)
        .then(({ id }) => setUploads((u) => u.map((x) => (x === pending ? { ...x, id } : x))))
        .catch((e) => setUploads((u) => u.map((x) => (x === pending ? { ...x, error: e.message } : x))))
    }
  }

  const removeUpload = (p: PendingUpload) => {
    URL.revokeObjectURL(p.previewUrl)
    setUploads((u) => u.filter((x) => x !== p))
  }

  const canSend = !streaming && text.trim().length > 0 && uploads.every((u) => u.id || u.error)

  // Drives a reply stream into a placeholder assistant bubble, then reconciles with the server.
  const consume = async (stream: AsyncGenerator<ChatStreamEvent>, assistantId: string, controller: AbortController) => {
    const patchAssistant = (patch: Partial<DisplayMessage> | ((m: DisplayMessage) => DisplayMessage)) =>
      setMessages((list) =>
        list.map((m) => (m.id === assistantId ? (typeof patch === 'function' ? patch(m) : { ...m, ...patch }) : m)),
      )
    let failure: string | null = null
    let partial = ''
    try {
      for await (const evt of stream) {
        if (evt.type === 'text') {
          partial += evt.text
          patchAssistant((m) => ({ ...m, content: m.content + evt.text }))
        } else if (evt.type === 'error') {
          failure = evt.message
          patchAssistant({ error: evt.message, streaming: false })
        } else if (evt.type === 'completed') {
          patchAssistant({ streaming: false })
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        failure = err instanceof Error ? err.message : String(err)
        patchAssistant({ error: failure, streaming: false })
      }
    } finally {
      patchAssistant({ streaming: false })
      setStreaming(false)
      abortRef.current = null
      // Pull the persisted versions (real ids, attachment refs) and the possibly-renamed chat.
      await load()
      void refresh()
      // A failed reply is never persisted, so re-attach the error after the reload or it
      // silently disappears.
      if (failure) {
        const message = failure
        setMessages((list) => [
          ...list,
          { id: assistantId, role: 'Assistant', content: partial, attachments: [], error: message },
        ])
      }
    }
  }

  const generateImage = async () => {
    const prompt = text.trim()
    setText('')
    setStreaming(true)
    setImageError(null)
    setAttached(true)
    try {
      await api.generateImage({ prompt, chatId })
      await load()
      void refresh()
    } catch (err) {
      setImageError(err instanceof Error ? err.message : String(err))
      setText(prompt)
    } finally {
      setStreaming(false)
    }
  }

  const send = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!canSend) return
    if (imageMode) return generateImage()
    const attachmentIds = uploads.filter((u) => u.id).map((u) => u.id!)
    const previewUrls = uploads.filter((u) => u.id).map((u) => u.previewUrl)
    const userMsg: DisplayMessage = {
      id: `local-${Date.now()}`,
      role: 'User',
      content: text,
      attachments: [],
      previewUrls,
    }
    const assistantId = `local-${Date.now()}-a`
    setMessages((m) => [...m, userMsg, { id: assistantId, role: 'Assistant', content: '', attachments: [], streaming: true }])
    setText('')
    setUploads([])
    setStreaming(true)
    setAttached(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await consume(api.sendMessage(chatId, userMsg.content, attachmentIds, controller.signal), assistantId, controller)
    } finally {
      previewUrls.forEach((u) => URL.revokeObjectURL(u))
    }
  }

  const actions: MessageActions = {
    onEdit: async (id, content) => {
      setActionError(null)
      try {
        await api.updateMessage(chatId, id, content)
        setMessages((list) => list.map((m) => (m.id === id ? { ...m, content, attachments: m.attachments.filter((a) => a.kind !== 'TtsAudio') } : m)))
      } catch (e) {
        setActionError(e instanceof Error ? e.message : String(e))
        throw e
      }
    },
    onDelete: async (id) => {
      if (!confirm('Delete this message?')) return
      setActionError(null)
      try {
        await api.deleteMessage(chatId, id)
        setMessages((list) => list.filter((m) => m.id !== id))
      } catch (e) {
        setActionError(e instanceof Error ? e.message : String(e))
      }
    },
    onRegenerate: (id) => {
      if (streaming) return
      setActionError(null)
      const index = messages.findIndex((m) => m.id === id)
      const assistantId = `local-${Date.now()}-a`
      // Drop the target and everything after it locally, mirroring what the server does.
      setMessages((list) => [...list.slice(0, index), { id: assistantId, role: 'Assistant', content: '', attachments: [], streaming: true }])
      setStreaming(true)
      setAttached(true)
      const controller = new AbortController()
      abortRef.current = controller
      void consume(api.regenerate(chatId, id, controller.signal), assistantId, controller)
    },
  }

  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'Assistant' && !m.id.startsWith('local-'))?.id

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          onWheel={onWheel}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onKeyDown={onScrollKey}
          tabIndex={-1}
          className="h-full overflow-y-auto outline-none"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-6">
            {loadError && <p className="text-destructive text-sm">{loadError}</p>}
            {messages.length === 0 && !loadError && (
              <p className="text-muted-foreground py-12 text-center text-sm">Say something to get started.</p>
            )}
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                tts={tts}
                actions={actions}
                canRegenerate={m.id === lastAssistantId}
                busy={streaming}
              />
            ))}
            {streaming && imageMode && (
              <p className="text-muted-foreground animate-pulse text-sm">Generating image…</p>
            )}
            {actionError && <p className="text-destructive text-sm">{actionError}</p>}
          </div>
        </div>
        {!attached && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Jump to latest"
            onClick={() => {
              setAttached(true)
              scrollToBottom('smooth')
            }}
            className="bg-background hover:bg-muted absolute right-4 bottom-3 z-10 rounded-full border shadow-md"
          >
            <ArrowDown />
          </Button>
        )}
      </div>

      <form onSubmit={send} className="border-border border-t p-3">
        <div className="mx-auto max-w-3xl">
          {uploads.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {uploads.map((u) => (
                <div key={u.previewUrl} className="relative">
                  <img
                    src={u.previewUrl}
                    alt={u.file.name}
                    className={`size-16 rounded-md object-cover ${u.id ? '' : 'opacity-50'} ${u.error ? 'ring-destructive ring-2' : ''}`}
                    title={u.error}
                  />
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() => removeUpload(u)}
                    className="bg-background text-foreground absolute -top-1.5 -right-1.5 rounded-full border p-0.5 shadow"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {imageError && <p className="text-destructive mb-2 text-sm">{imageError}</p>}
          <div className="bg-background flex items-end gap-2 rounded-xl border p-2 shadow-xs">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Attach image"
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming || imageMode}
            >
              <ImagePlus />
            </Button>
            <Button
              type="button"
              variant={imageMode ? 'secondary' : 'ghost'}
              size="icon"
              aria-label="Generate image"
              aria-pressed={imageMode}
              title="Generate an image from the prompt instead of chatting"
              onClick={() => setImageMode((v) => !v)}
              disabled={streaming}
            >
              <Sparkles />
            </Button>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={imageMode ? 'Describe the image to generate…' : 'Message… (Enter to send, Shift+Enter for newline)'}
              rows={1}
              className="max-h-48 min-h-9 flex-1 resize-none border-0 shadow-none focus-visible:ring-0"
            />
            {streaming ? (
              <Button type="button" variant="outline" size="icon" aria-label="Stop" onClick={() => abortRef.current?.abort()}>
                <Square />
              </Button>
            ) : (
              <Button type="submit" size="icon" aria-label="Send" disabled={!canSend}>
                <SendHorizontal />
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}
