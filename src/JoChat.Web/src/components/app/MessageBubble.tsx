import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Loader2, Square, Volume2 } from 'lucide-react'
import { useApi, type AttachmentRef } from '@/lib/api'
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
  const canSpeak = !isUser && !!tts && !message.streaming && message.content.length > 0
  return (
    <div className={cn('group flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'relative max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
        )}
      >
        {canSpeak && <SpeakButton text={message.content} tts={tts} />}
        {(message.previewUrls?.length || message.attachments.length) ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {message.previewUrls?.map((u) => (
              <img key={u} src={u} alt="" className="max-h-48 rounded-md object-contain" />
            ))}
            {!message.previewUrls?.length &&
              message.attachments.map((a) => (
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

function SpeakButton({ text, tts }: { text: string; tts: TtsDefaults }) {
  const api = useApi()
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle')
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const stop = () => {
    audioRef.current?.pause()
    if (audioRef.current) URL.revokeObjectURL(audioRef.current.src)
    audioRef.current = null
    setState('idle')
  }
  useEffect(() => stop, [])

  const play = async () => {
    setState('loading')
    setError(null)
    try {
      const url = await api.speak({ text, provider: tts.provider, voiceId: tts.voiceId })
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = stop
      await audio.play()
      setState('playing')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setState('idle')
    }
  }

  return (
    <div className="absolute -top-2 -right-2 flex items-center gap-1">
      {error && <span className="text-destructive bg-background rounded border px-1 text-xs shadow">{error}</span>}
      <button
        type="button"
        aria-label={state === 'playing' ? 'Stop' : 'Read aloud'}
        onClick={state === 'playing' ? stop : play}
        disabled={state === 'loading'}
        className={cn(
          'bg-background text-foreground rounded-full border p-1 shadow transition-opacity',
          state === 'idle' && 'opacity-0 group-hover:opacity-100 focus:opacity-100',
        )}
      >
        {state === 'loading' ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : state === 'playing' ? (
          <Square className="size-3.5" />
        ) : (
          <Volume2 className="size-3.5" />
        )}
      </button>
    </div>
  )
}
