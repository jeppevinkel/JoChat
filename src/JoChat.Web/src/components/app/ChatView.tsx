import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useParams } from 'react-router'
import { ImagePlus, SendHorizontal, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useApi } from '@/lib/api'
import { useChats } from '@/lib/use-chats'
import { MessageBubble, type DisplayMessage } from './MessageBubble'

interface PendingUpload {
  file: File
  previewUrl: string
  id?: string
  error?: string
}

// Keyed by chat id so switching chats remounts with fresh state instead of resetting in an effect.
export function ChatView() {
  const { id } = useParams<{ id: string }>()
  if (!id) return null
  return <ChatPane key={id} chatId={id} />
}

function ChatPane({ chatId }: { chatId: string }) {
  const api = useApi()
  const { refresh } = useChats()
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [uploads, setUploads] = useState<PendingUpload[]>([])
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const list = await api.messages(chatId)
      setMessages(list.map((m) => ({ id: m.id, role: m.role, content: m.content, attachments: m.attachments })))
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }, [api, chatId])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- async fetch; setState only runs after the await
    void load()
    return () => abortRef.current?.abort()
  }, [load])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

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

  const send = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!canSend) return
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
    const controller = new AbortController()
    abortRef.current = controller

    const patchAssistant = (patch: Partial<DisplayMessage> | ((m: DisplayMessage) => DisplayMessage)) =>
      setMessages((list) =>
        list.map((m) => (m.id === assistantId ? (typeof patch === 'function' ? patch(m) : { ...m, ...patch }) : m)),
      )

    let failure: string | null = null
    let partial = ''
    try {
      for await (const evt of api.sendMessage(chatId, userMsg.content, attachmentIds, controller.signal)) {
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
      previewUrls.forEach((u) => URL.revokeObjectURL(u))
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

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-6">
          {loadError && <p className="text-destructive text-sm">{loadError}</p>}
          {messages.length === 0 && !loadError && (
            <p className="text-muted-foreground py-12 text-center text-sm">Say something to get started.</p>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          <div ref={bottomRef} />
        </div>
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
              disabled={streaming}
            >
              <ImagePlus />
            </Button>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message… (Enter to send, Shift+Enter for newline)"
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
