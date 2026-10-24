import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApi, type AdminChat } from '@/lib/api'
import { AttachmentSourceContext } from '@/lib/attachment-source'
import { messageImages } from '@/lib/use-image-gallery'
import { useAdminUsers } from '@/lib/use-admin-users'
import { ImageGalleryProvider } from './ImageViewer'
import { MessageBubble } from './MessageBubble'
import { PageHeader } from './PageHeader'

// Read-only transcript of any user's chat, for moderation. Loading it is recorded in the admin
// audit log by the API; images come through the admin attachment route.
export default function AdminChatPage() {
  const { id = '' } = useParams<{ id: string }>()
  const api = useApi()
  const navigate = useNavigate()
  const location = useLocation()
  const { nameOf } = useAdminUsers()
  const [chat, setChat] = useState<AdminChat | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.admin
      .chat(id)
      .then((c) => !cancelled && setChat(c))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [api, id])

  const resolver = useMemo(() => (attachmentId: string) => api.admin.attachmentBlobUrl(attachmentId), [api])
  const gallery = useMemo(() => chat?.messages.flatMap(messageImages) ?? [], [chat])

  // Back to the (filtered) list it was opened from; straight to the chat list from a direct link.
  const back = () => (location.key !== 'default' ? navigate(-1) : navigate('/admin?tab=chats'))

  return (
    <AttachmentSourceContext.Provider value={resolver}>
      <ImageGalleryProvider items={gallery}>
        <PageHeader>
          <Button variant="ghost" size="icon" aria-label="Back" title="Back" onClick={back} className="pointer-coarse:size-10">
            <ArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="font-heading truncate text-base leading-snug font-semibold" title={chat?.title}>
              {chat?.title ?? 'Chat'}
            </h1>
            {chat && (
              <p className="text-muted-foreground truncate text-xs">
                {nameOf(chat.ownerId)} · {chat.persona?.name ?? 'unknown persona'}
                {chat.persona ? ` · ${chat.persona.modelId}` : ''}
                {chat.isShared ? ' · shared' : ''}
              </p>
            )}
          </div>
        </PageHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-8">
            <p className="text-muted-foreground flex items-center gap-2 text-xs">
              <Eye className="size-3.5 shrink-0" />
              Read-only moderation view. Opening this chat was recorded in the audit log.
            </p>
            {error && <p className="text-destructive text-sm">{error}</p>}
            {chat?.persona && (
              <details className="bg-card rounded-lg border px-3 py-2 text-sm">
                <summary className="cursor-pointer">
                  Persona <span className="font-medium">{chat.persona.name}</span>
                  {chat.persona.description && <span className="text-muted-foreground"> — {chat.persona.description}</span>}
                </summary>
                <pre className="bg-muted mt-2 max-h-80 overflow-auto rounded-md p-2.5 font-mono text-xs whitespace-pre-wrap">
                  {chat.persona.systemPrompt || '(empty system prompt)'}
                </pre>
              </details>
            )}
            {chat?.messages.length === 0 && <p className="text-muted-foreground text-sm">This chat has no messages.</p>}
            {chat?.messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={{ id: m.id, role: m.role, content: m.content, attachments: m.attachments, steps: m.toolActivity ?? undefined }}
                speaker={chat.persona?.name ?? 'Assistant'}
              />
            ))}
          </div>
        </div>
      </ImageGalleryProvider>
    </AttachmentSourceContext.Provider>
  )
}
