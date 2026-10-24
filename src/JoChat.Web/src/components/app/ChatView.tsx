import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type TouchEvent,
  type UIEvent,
  type WheelEvent,
} from 'react'
import { useParams } from 'react-router'
import { ArrowDown, ImagePlus, Loader2, SendHorizontal, Sparkles, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useApi, type ChatStreamEvent, type ToolStep } from '@/lib/api'
import { useChats } from '@/lib/use-chats'
import { messageImages, useImageGallery, type GalleryItem } from '@/lib/use-image-gallery'
import { COARSE_POINTER_QUERY, useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import { ChatHeader } from './ChatHeader'
import { ImageGalleryProvider } from './ImageViewer'
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

// What the upload endpoint accepts; pasted or dropped files of other types are ignored.
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

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
  const [dragging, setDragging] = useState(false)
  // Touch keyboards have no comfortable Shift+Enter, so there Enter makes a newline and the
  // button sends; with a hardware keyboard Enter sends.
  const touch = useMediaQuery(COARSE_POINTER_QUERY)
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
      setMessages(list.map((m) => ({ id: m.id, role: m.role, content: m.content, attachments: m.attachments, steps: m.toolActivity ?? undefined })))
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
  const summary = chats.find((c) => c.id === chatId)
  const title = summary?.title
  useEffect(() => {
    if (!title) return
    document.title = `${title} · JoChat`
    return () => {
      document.title = 'JoChat'
    }
  }, [title])
  const personaId = summary?.personaId
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

  const addFiles = (files: File[]) => {
    for (const file of files.filter((f) => IMAGE_TYPES.includes(f.type))) {
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

  const canAttach = !streaming && !imageMode
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(e.clipboardData.files).filter((f) => IMAGE_TYPES.includes(f.type))
    if (!canAttach || images.length === 0) return
    e.preventDefault()
    addFiles(images)
  }
  const onDragOver = (e: DragEvent) => {
    if (!canAttach || !e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (!dragging) setDragging(true)
  }
  const onDragLeave = (e: DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
  }
  const onDrop = (e: DragEvent) => {
    setDragging(false)
    if (!canAttach) return
    e.preventDefault()
    addFiles(Array.from(e.dataTransfer.files))
  }

  // Every image in the conversation plus the pending uploads, in order, for the full-size viewer.
  const gallery = useMemo<GalleryItem[]>(
    () => [...messages.flatMap(messageImages), ...uploads.map((u) => ({ key: u.previewUrl, src: u.previewUrl, name: u.file.name }))],
    [messages, uploads],
  )

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
        } else if (evt.type === 'tool_use' || evt.type === 'tool_result') {
          const step: ToolStep = {
            kind: evt.type === 'tool_use' ? 'use' : 'result',
            tool: evt.tool,
            label: evt.label,
            isError: evt.type === 'tool_result' && evt.isError,
          }
          patchAssistant((m) => ({ ...m, steps: [...(m.steps ?? []), step] }))
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
    if (e.key === 'Enter' && !e.shiftKey && !touch && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <ImageGalleryProvider items={gallery}>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        {summary && <ChatHeader chat={summary} />}
        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            onScroll={onScroll}
            onWheel={onWheel}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onKeyDown={onScrollKey}
            tabIndex={-1}
            className="h-full overflow-y-auto overscroll-contain outline-none"
          >
            <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-8">
              {loadError && <p className="text-destructive text-sm">{loadError}</p>}
              {messages.length === 0 && !loadError && (
                <p className="text-muted-foreground font-heading py-16 text-center text-lg italic">Say something to get started.</p>
              )}
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  tts={tts}
                  actions={actions}
                  canRegenerate={m.id === lastAssistantId}
                  busy={streaming}
                  speaker={summary?.personaName}
                />
              ))}
              {streaming && imageMode && (
                <p className="text-muted-foreground font-heading animate-pulse italic">Generating image…</p>
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
              className="bg-background hover:bg-muted absolute right-4 bottom-3 z-10 rounded-full border shadow-md pointer-coarse:size-10"
            >
              <ArrowDown />
            </Button>
          )}
        </div>

        <form onSubmit={send} className="px-2 pb-2 sm:px-6 sm:pb-5">
          <div className="mx-auto max-w-3xl">
            {uploads.length > 0 && <UploadStrip uploads={uploads} onRemove={removeUpload} />}
            {imageError && <p className="text-destructive mb-2 text-sm">{imageError}</p>}
            <div className="bg-card focus-within:border-accent-ink/60 flex items-end gap-1 rounded-lg border p-1.5 shadow-[0_1px_0_var(--border),0_8px_24px_-12px_color-mix(in_oklab,var(--foreground)_25%,transparent)] transition-colors sm:gap-1.5 sm:p-2">
              <input
                ref={fileInputRef}
                type="file"
                accept={IMAGE_TYPES.join(',')}
                multiple
                hidden
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []))
                  e.target.value = ''
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Attach image"
                title="Attach image (or paste / drop one)"
                onClick={() => fileInputRef.current?.click()}
                disabled={!canAttach}
                className="pointer-coarse:size-9"
              >
                <ImagePlus />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Generate image"
                aria-pressed={imageMode}
                title="Generate an image from the prompt instead of chatting"
                onClick={() => setImageMode((v) => !v)}
                disabled={streaming}
                className={cn('pointer-coarse:size-9', imageMode && 'bg-accent-ink/20 text-foreground hover:bg-accent-ink/30')}
              >
                <Sparkles />
              </Button>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                // Focusing on a touch device would throw up the keyboard over the conversation.
                autoFocus={!touch}
                enterKeyHint={touch ? 'enter' : 'send'}
                placeholder={
                  imageMode
                    ? 'Describe the image to generate…'
                    : touch
                      ? 'Message…'
                      : 'Message… (Enter to send, Shift+Enter for newline)'
                }
                rows={1}
                className="max-h-36 min-h-8 flex-1 resize-none border-0 bg-transparent px-1.5 py-1.5 shadow-none focus-visible:ring-0 sm:max-h-48 sm:min-h-9 dark:bg-transparent"
              />
              {streaming ? (
                <Button type="button" variant="outline" size="icon" aria-label="Stop" onClick={() => abortRef.current?.abort()} className="pointer-coarse:size-9">
                  <Square />
                </Button>
              ) : (
                <Button type="submit" size="icon" aria-label="Send" disabled={!canSend} className="bg-accent-ink text-accent-ink-foreground hover:bg-accent-ink/85 pointer-coarse:size-9">
                  <SendHorizontal />
                </Button>
              )}
            </div>
          </div>
        </form>

        {dragging && (
          <div className="bg-background/80 border-primary text-foreground pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-xl border-2 border-dashed text-sm font-medium backdrop-blur-xs">
            Drop images to attach
          </div>
        )}
      </div>
    </ImageGalleryProvider>
  )
}

// Images waiting to be sent: tap to view full size, × to drop. Upload failures are spelled out
// rather than left in a tooltip that touch screens can't show.
function UploadStrip({ uploads, onRemove }: { uploads: PendingUpload[]; onRemove: (u: PendingUpload) => void }) {
  const gallery = useImageGallery()
  const failed = uploads.filter((u) => u.error)
  return (
    <div className="mb-2 grid gap-1">
      <div className="flex flex-wrap gap-2 pt-1.5">
        {uploads.map((u) => (
          <div key={u.previewUrl} className="relative">
            <button type="button" onClick={() => gallery.open(u.previewUrl)} aria-label={`View ${u.file.name}`} className="block cursor-zoom-in rounded-md">
              <img
                src={u.previewUrl}
                alt={u.file.name}
                className={cn('size-16 rounded-md object-cover', !u.id && 'opacity-50', u.error && 'ring-destructive ring-2')}
                title={u.error}
              />
            </button>
            {!u.id && !u.error && <Loader2 className="pointer-events-none absolute inset-0 m-auto size-5 animate-spin" />}
            <button
              type="button"
              aria-label={`Remove ${u.file.name}`}
              onClick={() => onRemove(u)}
              className="bg-background text-foreground absolute -top-1.5 -right-1.5 rounded-full border p-0.5 shadow pointer-coarse:-top-2 pointer-coarse:-right-2 pointer-coarse:p-1"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
      </div>
      {failed.map((u) => (
        <p key={u.previewUrl} className="text-destructive text-xs">
          {u.file.name}: {u.error}
        </p>
      ))}
    </div>
  )
}
