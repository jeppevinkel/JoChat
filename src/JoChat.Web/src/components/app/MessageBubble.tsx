import { Suspense, lazy, useState, type KeyboardEvent } from 'react'
import { Check, Globe, Loader2, Pencil, RefreshCw, Search, Square, Terminal, Trash2, Volume2, Wrench, X } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { useApi, type AttachmentRef, type ToolStep } from '@/lib/api'
import { play, stop, usePlayer } from '@/lib/tts-player'
import { cn } from '@/lib/utils'
import { AuthImage } from './AuthImage'

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
}

export function MessageBubble({ message, tts, actions, canRegenerate, busy }: Props) {
  const isUser = message.role === 'User'
  // Local placeholders (in-flight or failed replies) have no server id to act on.
  const persisted = !message.id.startsWith('local-')
  const canSpeak = !isUser && !!tts && !message.streaming && persisted && message.content.length > 0
  const canAct = persisted && !message.streaming && !busy && !!actions
  const images = message.attachments.filter((a) => a.kind !== 'TtsAudio')
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
    <div className={cn('group flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'relative min-w-0 max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
          editing && 'w-[85%]',
        )}
      >
        {!editing && (canAct || canSpeak) && (
          <div className="absolute -top-3 right-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-[[data-active]]:opacity-100">
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

        {(message.previewUrls?.length || images.length) ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {message.previewUrls?.map((u) => (
              <img key={u} src={u} alt="" className="max-h-48 rounded-md object-contain" />
            ))}
            {!message.previewUrls?.length &&
              images.map((a) => (
                <AuthImage key={a.id} id={a.id} className="max-h-48 max-w-64" />
              ))}
          </div>
        ) : null}

        {editing ? (
          <div className="grid gap-2">
            <Textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={Math.min(12, Math.max(3, draft.split('\n').length))}
              className={cn('bg-background text-foreground resize-y', isUser && 'border-primary-foreground/30')}
              disabled={saving}
            />
            <div className="flex items-center justify-end gap-1 text-xs">
              <span className={cn('mr-auto opacity-70')}>Ctrl+Enter to save · Esc to cancel</span>
              <ActionButton label="Cancel" onClick={() => setEditing(false)} inline>
                <X className="size-3.5" />
              </ActionButton>
              <ActionButton label="Save" onClick={() => void save()} inline disabled={saving}>
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              </ActionButton>
            </div>
          </div>
        ) : (
          <div className="prose-chat">
            {message.steps && message.steps.length > 0 && <ToolActivity steps={message.steps} />}
            <Suspense fallback={<p className="whitespace-pre-wrap">{message.content}</p>}>
              <MarkdownContent>{message.content}</MarkdownContent>
            </Suspense>
            {message.streaming && !message.content && (
              <span className="text-muted-foreground animate-pulse">Thinking…</span>
            )}
          </div>
        )}
        {message.error && <p className="text-destructive mt-2 text-xs">{message.error}</p>}
      </div>
    </div>
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
    <ul className="text-muted-foreground mb-2 grid gap-0.5 text-xs">
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

function ActionButton({
  label,
  onClick,
  children,
  inline,
  disabled,
  active,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  inline?: boolean
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      data-active={active || undefined}
      className={cn(
        'bg-background text-foreground rounded-full border p-1 shadow disabled:opacity-50',
        inline && 'shadow-none',
      )}
    >
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
      {error && <span className="text-destructive bg-background rounded border px-1 text-xs shadow">{error}</span>}
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
