import { Suspense, lazy, useState, type KeyboardEvent } from 'react'
import { Download, Globe, Loader2, Pencil, RefreshCw, Search, Square, Terminal, Trash2, Volume2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useApi, type AttachmentRef, type ToolStep } from '@/lib/api'
import { useAttachmentResolver } from '@/lib/attachment-source'
import { messageImages, useImageGallery, type GalleryItem } from '@/lib/use-image-gallery'
import { play, stop, usePlayer } from '@/lib/tts-player'
import { cn } from '@/lib/utils'
import { AuthImage } from './AuthImage'
import { Monogram } from './Brand'
import { CopyButton } from './CopyButton'

const MarkdownContent = lazy(() => import('./MarkdownContent'))

export interface TtsDefaults {
  provider: string
  voiceId: string
}

export interface DisplayMessage {
  id: string
  role: 'User' | 'Assistant'
  content: string
  attachments: AttachmentRef[]
  // Local previews for just-sent uploads that aren't fetched back from the API yet.
  previewUrls?: string[]
  steps?: ToolStep[]
  streaming?: boolean
  error?: string
}

export interface MessageActions {
  onEdit: (id: string, content: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onRegenerate: (id: string) => void
}

interface Props {
  message: DisplayMessage
  tts?: TtsDefaults | null
  actions?: MessageActions
  canRegenerate?: boolean
  busy?: boolean
  /** Who replies (the persona's name), shown above assistant turns. */
  speaker?: string
}

export function MessageBubble({ message, tts, actions, canRegenerate, busy, speaker }: Props) {
  const isUser = message.role === 'User'
  // Local placeholders (in-flight or failed replies) have no server id to act on.
  const persisted = !message.id.startsWith('local-')
  const canSpeak = !isUser && !!tts && !message.streaming && persisted && message.content.length > 0
  const canAct = persisted && !message.streaming && !busy && !!actions
  const canCopy = !message.streaming && message.content.length > 0
  const images = messageImages(message)
  const files = message.attachments.filter((a) => a.kind === 'GeneratedFile')
  const cachedAudio = message.attachments.find((a) => a.kind === 'TtsAudio')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const [saving, setSaving] = useState(false)

  const startEdit = () => {
    setDraft(message.content)
    setEditing(true)
  }
  const save = async () => {
    if (!actions || draft.trim() === '' || draft === message.content) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await actions.onEdit(message.id, draft)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') setEditing(false)
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save()
  }

  return (
    // Focusable so a tap on a touch screen reveals the message's actions (via focus-within).
    <div tabIndex={-1} className={cn('group/msg flex w-full flex-col outline-none', isUser ? 'items-end' : 'items-start')}>
      {!isUser && speaker && (
        <div className="text-muted-foreground mb-1.5 flex items-center gap-2 text-[0.7rem] font-semibold tracking-[0.12em] uppercase">
          <Monogram name={speaker} />
          {speaker}
        </div>
      )}
      <div
        className={cn(
          'relative min-w-0',
          // Your words: a slip of paper, offset right. Replies: open text on the page, like a transcript.
          isUser
            ? 'bg-user-bubble max-w-[88%] rounded-md rounded-tr-[2px] border border-[color-mix(in_oklab,var(--accent-ink)_22%,transparent)] px-3.5 py-2.5 text-[0.9375rem] leading-relaxed sm:max-w-[80%]'
            : 'w-full',
          editing && 'w-full sm:w-[85%]',
        )}
      >
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap items-start gap-2">
            {images.map((item) => (
              <Thumbnail key={item.key} item={item} single={images.length === 1} />
            ))}
          </div>
        )}

        {editing ? (
          <div className="grid gap-2">
            <Textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={Math.min(12, Math.max(3, draft.split('\n').length))}
              className="bg-background text-foreground max-h-[60dvh] resize-y"
              disabled={saving}
            />
            <div className="flex items-center justify-end gap-1.5 text-xs">
              <span className="mr-auto opacity-70 pointer-coarse:hidden">Ctrl+Enter to save · Esc to cancel</span>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving} className="pointer-coarse:h-9">
                Cancel
              </Button>
              <Button size="sm" onClick={() => void save()} disabled={saving} className="pointer-coarse:h-9">
                {saving && <Loader2 data-icon="inline-start" className="animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className={cn('prose-chat', isUser ? 'prose-user' : 'prose-reply')}>
            {message.steps && message.steps.length > 0 && <ToolActivity steps={message.steps} />}
            <Suspense fallback={<p className="whitespace-pre-wrap">{message.content}</p>}>
              <MarkdownContent>{message.content}</MarkdownContent>
            </Suspense>
            {message.streaming && !message.content && (
              <span className="text-muted-foreground animate-pulse italic">Thinking…</span>
            )}
          </div>
        )}
        {files.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {files.map((f) => (
              <li key={f.id}>
                <FileChip attachment={f} />
              </li>
            ))}
          </ul>
        )}
        {message.error && <p className="text-destructive mt-2 font-sans text-xs">{message.error}</p>}
      </div>

      {!editing && (canCopy || canAct || canSpeak) && (
        <div
          className={cn(
            'text-muted-foreground mt-1 flex items-center gap-0.5 opacity-0 transition-opacity',
            isUser ? 'px-0.5' : '-ml-1.5',
            'group-hover/msg:opacity-100 group-focus-within/msg:opacity-100 has-[[data-active]]:opacity-100',
            // No hover on touch screens: replies always show theirs, your own messages on tap.
            !isUser && 'pointer-coarse:opacity-100',
          )}
        >
          {canCopy && <CopyButton text={message.content} label="Copy message" className={actionButtonClass} />}
          {canSpeak && <SpeakButton messageId={message.id} cachedAudioId={cachedAudio?.id} tts={tts} />}
          {canAct && (
            <>
              {!isUser && canRegenerate && (
                <ActionButton label="Regenerate" onClick={() => actions.onRegenerate(message.id)}>
                  <RefreshCw className="size-3.5" />
                </ActionButton>
              )}
              <ActionButton label="Edit" onClick={startEdit}>
                <Pencil className="size-3.5" />
              </ActionButton>
              <ActionButton label="Delete" onClick={() => void actions.onDelete(message.id)}>
                <Trash2 className="size-3.5" />
              </ActionButton>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Opens the conversation-wide image viewer at this image.
function Thumbnail({ item, single }: { item: GalleryItem; single: boolean }) {
  const gallery = useImageGallery()
  const size = single ? 'max-h-80 max-w-full sm:max-w-96' : 'max-h-48 max-w-full sm:max-w-64'
  return (
    <button
      type="button"
      onClick={() => gallery.open(item.key)}
      aria-label={`View ${item.name}`}
      className="focus-visible:ring-ring/50 block max-w-full cursor-zoom-in rounded-sm outline-none focus-visible:ring-3 [&_img]:rounded-sm [&_img]:border [&>div]:rounded-sm"
    >
      {item.attachmentId ? (
        <AuthImage id={item.attachmentId} width={item.width} height={item.height} className={size} />
      ) : (
        <img src={item.src} alt="" className={cn('rounded-md object-contain', size)} />
      )}
    </button>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// Files the model produced (code execution output); downloaded through the authenticated API.
function FileChip({ attachment }: { attachment: AttachmentRef }) {
  const resolve = useAttachmentResolver()
  const [busy, setBusy] = useState(false)
  const name = attachment.fileName ?? 'file'
  const download = async () => {
    setBusy(true)
    try {
      const url = await resolve(attachment.id)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className="bg-card text-foreground hover:border-accent-ink inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-sans text-xs transition-colors disabled:opacity-50"
      title={`${name} · ${formatBytes(attachment.sizeBytes)}`}
    >
      {busy ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
      <span className="max-w-48 truncate">{name}</span>
      <span className="text-muted-foreground">{formatBytes(attachment.sizeBytes)}</span>
    </button>
  )
}

const TOOL_ICONS: Record<string, typeof Wrench> = {
  web_search: Search,
  web_fetch: Globe,
  code_execution: Terminal,
  bash_code_execution: Terminal,
  text_editor_code_execution: Terminal,
}

// Compact log of what the model did with its tools, shown above the reply text.
function ToolActivity({ steps }: { steps: ToolStep[] }) {
  return (
    <ul className="text-muted-foreground border-accent-ink/60 mb-3 grid gap-0.5 border-l-2 py-0.5 pl-3 font-sans text-xs">
      {steps.map((s, i) => {
        const Icon = TOOL_ICONS[s.tool] ?? Wrench
        return (
          <li key={i} className={cn('flex items-start gap-1.5', s.isError && 'text-destructive', s.kind === 'result' && 'pl-4')}>
            {s.kind === 'use' && <Icon className="mt-0.5 size-3 shrink-0" />}
            <span className="break-words">{s.label}</span>
          </li>
        )
      })}
    </ul>
  )
}

const actionButtonClass =
  'hover:bg-muted hover:text-foreground inline-flex size-7 items-center justify-center rounded-md disabled:opacity-50 data-[active]:text-foreground pointer-coarse:size-9'

function ActionButton({
  label,
  onClick,
  children,
  disabled,
  active,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} data-active={active || undefined} className={actionButtonClass}>
      {children}
    </button>
  )
}

function SpeakButton({ messageId, cachedAudioId, tts }: { messageId: string; cachedAudioId?: string; tts: TtsDefaults }) {
  const api = useApi()
  const { status, error } = usePlayer(messageId)

  const start = () =>
    play(messageId, () =>
      cachedAudioId
        ? api.attachmentBlobUrl(cachedAudioId)
        : api.speak({ messageId, provider: tts.provider, voiceId: tts.voiceId }),
    )

  return (
    <>
      {error && <span className="text-destructive px-1 text-xs">{error}</span>}
      <ActionButton
        label={status === 'playing' ? 'Stop' : 'Read aloud'}
        onClick={status === 'idle' ? start : stop}
        active={status !== 'idle'}
      >
        {status === 'loading' ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : status === 'playing' ? (
          <Square className="size-3.5" />
        ) : (
          <Volume2 className="size-3.5" />
        )}
      </ActionButton>
    </>
  )
}
