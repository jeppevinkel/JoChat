import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { AuthImage } from './AuthImage'
import type { AttachmentRef } from '@/lib/api'

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

export function MessageBubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === 'User'
  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
        )}
      >
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
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose-chat">
            <Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
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
