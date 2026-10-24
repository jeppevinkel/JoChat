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
import { useLocation, useNavigate, useParams } from 'react-router'
import { ArrowDown, ImagePlus, Loader2, Plus, SendHorizontal, Sparkles, Square, Star, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useApi, type ChatStreamEvent, type Persona, type ToolStep } from '@/lib/api'
import { selectClass } from '@/lib/persona'
import { fenced, insideFence, looksLikeCode } from '@/lib/code-paste'
import { useChats } from '@/lib/use-chats'
import type { DraftState } from '@/lib/draft'
import { useDefaultPersona } from '@/lib/use-me'
import { messageImages, useImageGallery, type GalleryItem } from '@/lib/use-image-gallery'
import { COARSE_POINTER_QUERY, useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import { ChatHeader } from './ChatHeader'
import { ImageGalleryProvider } from './ImageViewer'
import { MessageBubble, type DisplayMessage, type MessageActions, type TtsDefaults } from './MessageBubble'
import { PersonaDialog } from './PersonaDialog'

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

// A draft's first message creates its chat and moves the URL from /chats/new to /chats/<id>,
// but the pane must stay mounted through that (the reply is still streaming into it), so the new
// id is aliased to the draft's pane key.
const paneAliases = new Map<string, string>()

// Keyed by chat id so switching chats remounts with fresh state instead of resetting in an effect.
// Drafts (/chats/new) are keyed by the draft key in the location state, so each "New conversation"
// starts from a clean composer.
export function ChatView() {
  const { id } = useParams<{ id: string }>()
  const state = useLocation().state as DraftState | null
  if (!id) return null
  if (id === 'new') {
    const key = `draft:${state?.draft ?? ''}`
    return <ChatPane key={key} paneKey={key} chatId={null} />
  }
  const key = paneAliases.get(id) ?? id
  return <ChatPane key={key} paneKey={key} chatId={id} />
}

// chatId is null for a draft: nothing exists on the server until the first message is sent.
function ChatPane({ chatId, paneKey }: { chatId: string | null; paneKey: string }) {
  const api = useApi()
  const navigate = useNavigate()
  const { chats, refresh } = useChats()
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [imageMode, setImageMode] = useState(false)
  // Problems to show above the composer: a failed image generation, or a first message that
  // couldn't start the chat (its text and images are put back for another try).
  const [composerError, setComposerError] = useState<string | null>(null)
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
  const streamingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const touchYRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    streamingRef.current = streaming
  }, [streaming])

  // The chat this pane talks to. Set the moment a draft's chat is created (before the URL and
  // the chatId prop catch up), so the stream's own reconciliation already loads the right chat.
  const chatIdRef = useRef(chatId)

  // Replaces the list with the server's; false when there is no chat yet or it couldn't load.
  const load = useCallback(async () => {
    const id = chatIdRef.current
    if (!id) return false
    try {
      const list = await api.messages(id)
      setMessages(list.map((m) => ({ id: m.id, role: m.role, content: m.content, attachments: m.attachments, steps: m.toolActivity ?? undefined })))
      setLoadError(null)
      return true
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
      return false
    }
  }, [api])

  // Once per pane: a draft that becomes a chat keeps its pane and its streamed state.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- async fetch; setState only runs after the await
    void load()
  }, [load])

  // Leaving the chat stops any reply still streaming into it.
  useEffect(() => () => abortRef.current?.abort(), [])

  // A draft's first message (or image) created its chat: adopt it without remounting the pane.
  const adoptChat = (id: string) => {
    chatIdRef.current = id
    paneAliases.set(id, paneKey)
    navigate(`/chats/${id}`, { replace: true })
    void refresh()
  }

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

  const summary = chatId ? chats.find((c) => c.id === chatId) : undefined
  // A just-created chat keeps its draft title until the refreshed chat list has it.
  const startedAsDraft = paneKey.startsWith('draft:')
  const title = summary?.title ?? (startedAsDraft ? 'New chat' : '')
  useEffect(() => {
    if (!title) return
    document.title = `${title} · JoChat`
    return () => {
      document.title = 'JoChat'
    }
  }, [title])
  // The personas you can use: read-aloud takes the chat persona's voice (no voice, no button), and
  // a draft offers the list so you can pick who to talk to before the first message.
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const loadPersonas = useCallback(async () => {
    try {
      setPersonas(await api.personas())
    } catch {
      setPersonas([])
    }
  }, [api])
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- async fetch; setState only runs after the await
    void loadPersonas()
  }, [loadPersonas])

  // A draft talks to the persona you pick, else your default, else the one from your most recent
  // chat, else the first. Once the chat exists its persona is fixed.
  const { defaultPersonaId, setDefaultPersona } = useDefaultPersona()
  const [draftPersonaId, setDraftPersonaId] = useState<string | null>(null)
  const find = (id: string | null | undefined) => (id ? personas?.find((p) => p.id === id) : undefined)
  const persona = chatId
    ? find(summary?.personaId ?? draftPersonaId)
    : (find(draftPersonaId) ?? find(defaultPersonaId) ?? find(chats[0]?.personaId) ?? personas?.[0])
  const [creatingPersona, setCreatingPersona] = useState(false)
  const tts = useMemo<TtsDefaults | null>(
    () => (persona?.defaultTtsProvider && persona.defaultTtsVoiceId ? { provider: persona.defaultTtsProvider, voiceId: persona.defaultTtsVoiceId } : null),
    [persona],
  )

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
  // Ctrl+Shift+V is the usual "paste as plain text": it skips the automatic code fence.
  const plainPasteRef = useRef(false)
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(e.clipboardData.files).filter((f) => IMAGE_TYPES.includes(f.type))
    if (images.length > 0) {
      if (!canAttach) return
      e.preventDefault()
      addFiles(images)
      return
    }
    const plain = plainPasteRef.current
    plainPasteRef.current = false
    const pasted = e.clipboardData.getData('text/plain')
    const el = e.currentTarget
    if (plain || imageMode || !looksLikeCode(pasted) || insideFence(el.value, el.selectionStart)) return
    e.preventDefault()
    const insert = fenced(pasted, el.value.slice(0, el.selectionStart), el.value.slice(el.selectionEnd))
    // execCommand keeps the paste a single native undo step; setText is the fallback.
    if (!document.execCommand('insertText', false, insert)) {
      setText(el.value.slice(0, el.selectionStart) + insert + el.value.slice(el.selectionEnd))
    }
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

  // A draft can only be sent once there's a persona to start the chat with.
  const canSend = !streaming && text.trim().length > 0 && uploads.every((u) => u.id || u.error) && (!!chatId || !!persona)

  // Drives a reply stream into a placeholder assistant bubble, then reconciles with the server.
  // Returns the failure message, if the reply failed.
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
        } else if (evt.type === 'chat_created') {
          adoptChat(evt.chatId)
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
      const reloaded = await load()
      void refresh()
      // A failed reply is never persisted, so re-attach the error after the reload or it
      // silently disappears. Without a reload the placeholder still shows it; adding it again
      // would show the error twice.
      if (failure && reloaded) {
        const message = failure
        setMessages((list) => [
          ...list,
          { id: assistantId, role: 'Assistant', content: partial, attachments: [], error: message },
        ])
      }
    }
    return failure
  }

  const generateImage = async () => {
    const prompt = text.trim()
    setText('')
    setStreaming(true)
    setComposerError(null)
    setAttached(true)
    try {
      const existing = chatIdRef.current
      if (!existing) setDraftPersonaId(persona!.id)
      const result = await api.generateImage(existing ? { prompt, chatId: existing } : { prompt, personaId: persona!.id })
      if (!existing && result.chatId) adoptChat(result.chatId)
      await load()
      void refresh()
    } catch (err) {
      setComposerError(err instanceof Error ? err.message : String(err))
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
    const sentUploads = uploads
    setMessages((m) => [...m, userMsg, { id: assistantId, role: 'Assistant', content: '', attachments: [], streaming: true }])
    setText('')
    setUploads([])
    setComposerError(null)
    setStreaming(true)
    setAttached(true)
    const controller = new AbortController()
    abortRef.current = controller
    const existing = chatIdRef.current
    if (!existing) setDraftPersonaId(persona!.id)
    const stream = existing
      ? api.sendMessage(existing, userMsg.content, attachmentIds, controller.signal)
      : api.startChat(persona!.id, userMsg.content, attachmentIds, controller.signal)
    const failure = await consume(stream, assistantId, controller)
    if (!chatIdRef.current) {
      // The chat was never created (the start failed or was stopped first): back to a draft with
      // the message in the composer, previews intact, so it can simply be sent again.
      setMessages([])
      setText(userMsg.content)
      setUploads(sentUploads)
      setComposerError(failure)
      return
    }
    previewUrls.forEach((u) => URL.revokeObjectURL(u))
  }

  const actions: MessageActions = {
    onEdit: async (id, content) => {
      setActionError(null)
      try {
        await api.updateMessage(chatIdRef.current!, id, content)
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
        await api.deleteMessage(chatIdRef.current!, id)
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
      void consume(api.regenerate(chatIdRef.current!, id, controller.signal), assistantId, controller)
    },
  }

  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'Assistant' && !m.id.startsWith('local-'))?.id

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    plainPasteRef.current = e.shiftKey && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v'
    if (e.key === 'Enter' && !e.shiftKey && !touch && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <ImageGalleryProvider items={gallery}>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        <ChatHeader
          title={title ?? ''}
          personaName={summary?.personaName ?? persona?.name}
          modelId={summary?.personaModelId ?? persona?.modelId}
          chat={summary}
        />
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
                <div className="grid justify-items-center gap-3 py-16 text-center">
                  <p className="text-muted-foreground font-heading text-lg italic">Say something to get started.</p>
                  {!chatId && personas && (
                    <DraftPersona
                      personas={personas}
                      current={persona}
                      isDefault={!!persona && persona.id === defaultPersonaId}
                      disabled={streaming}
                      onChange={setDraftPersonaId}
                      onToggleDefault={() => {
                        if (!persona) return
                        setDefaultPersona(persona.id === defaultPersonaId ? null : persona.id).catch((e) =>
                          setActionError(e instanceof Error ? e.message : String(e)),
                        )
                      }}
                      onCreate={() => setCreatingPersona(true)}
                    />
                  )}
                </div>
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
            {composerError && <p className="text-destructive mb-2 text-sm">{composerError}</p>}
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

        <PersonaDialog
          open={creatingPersona}
          onOpenChange={setCreatingPersona}
          persona={null}
          onSaved={(p) => {
            setDraftPersonaId(p.id)
            void loadPersonas()
          }}
        />

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

// Who a draft will talk to. Only drafts have a choice: the persona is part of the chat once its
// first message creates it (switching mid-conversation isn't supported yet).
function DraftPersona({
  personas,
  current,
  isDefault,
  disabled,
  onChange,
  onToggleDefault,
  onCreate,
}: {
  personas: Persona[]
  current: Persona | undefined
  isDefault: boolean
  disabled: boolean
  onChange: (personaId: string) => void
  onToggleDefault: () => void
  onCreate: () => void
}) {
  if (!current) {
    return (
      <div className="grid max-w-sm justify-items-center gap-2">
        <p className="text-muted-foreground text-sm">You need a persona to chat with: a name, a model and a system prompt.</p>
        <Button onClick={onCreate}>
          <Plus data-icon="inline-start" />
          Create a persona
        </Button>
      </div>
    )
  }
  return (
    <div className="grid max-w-sm justify-items-center gap-1.5">
      <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <label htmlFor="draft-persona">Talking to</label>
        {personas.length > 1 ? (
          <select
            id="draft-persona"
            className={cn(selectClass, 'text-foreground w-auto max-w-56 font-medium pointer-coarse:h-10')}
            value={current.id}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          >
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isShared && !p.isOwner ? ' (shared)' : ''}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-foreground font-medium">{current.name}</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-pressed={isDefault}
          aria-label={isDefault ? 'Stop using as default for new chats' : 'Use as default for new chats'}
          title={isDefault ? 'Default for new chats (click to unset)' : 'Use as default for new chats'}
          onClick={onToggleDefault}
          className="pointer-coarse:size-10"
        >
          <Star className={cn(isDefault && 'fill-accent-ink text-accent-ink')} />
        </Button>
      </div>
      {current.description && <p className="text-muted-foreground text-xs">{current.description}</p>}
    </div>
  )
}
