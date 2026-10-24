import { Suspense, lazy } from 'react'
import { Loader2, Square, Volume2 } from 'lucide-react'
import { useApi, type AttachmentRef } from '@/lib/api'
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
  streaming?: boolean
  error?: string
}

export function MessageBubble({ message, tts }: { message: DisplayMessage; tts?: TtsDefaults | null }) {
  const isUser = message.role === 'User'
  // Local placeholders (in-flight or failed replies) have no server id to synthesize from.
  const persisted = !message.id.startsWith('local-')
  const canSpeak = !isUser && !!tts && !message.streaming && persisted && message.content.length > 0
  const images = message.attachments.filter((a) => a.kind !== 'TtsAudio')
  const cachedAudio = message.attachments.find((a) => a.kind === 'TtsAudio')
  return (
    <div className={cn('group flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'relative max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
        )}
      >
        {canSpeak && <SpeakButton messageId={message.id} cachedAudioId={cachedAudio?.id} tts={tts} />}
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
        <div className="prose-chat">
          <Suspense fallback={<p className="whitespace-pre-wrap">{message.content}</p>}>
            <MarkdownContent>{message.content}</MarkdownContent>
          </Suspense>
          {message.streaming && !message.content && (
            <span className="text-muted-foreground animate-pulse">Thinking…</span>
          )}
        </div>
        {message.error && <p className="text-destructive mt-2 text-xs">{message.error}</p>}
      </div>
    </div>
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
    <div className="absolute -top-2 -right-2 flex items-center gap-1">
      {error && <span className="text-destructive bg-background rounded border px-1 text-xs shadow">{error}</span>}
      <button
        type="button"
        aria-label={status === 'playing' ? 'Stop' : 'Read aloud'}
        onClick={status === 'idle' ? start : stop}
        className={cn(
          'bg-background text-foreground rounded-full border p-1 shadow transition-opacity',
          status === 'idle' && !error && 'opacity-0 group-hover:opacity-100 focus:opacity-100',
        )}
      >
        {status === 'loading' ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : status === 'playing' ? (
          <Square className="size-3.5" />
        ) : (
          <Volume2 className="size-3.5" />
        )}
      </button>
    </div>
  )
}
