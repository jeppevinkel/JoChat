import { useState } from 'react'
import { Link } from 'react-router'
import { Link2, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ChatSummary } from '@/lib/api'
import { PageHeader } from './PageHeader'
import { ShareDialog } from './ShareDialog'

// Title plus the persona you're talking to; sharing lives here too.
export function ChatHeader({ chat }: { chat: ChatSummary }) {
  const [shareOpen, setShareOpen] = useState(false)
  const shareLabel = chat.isShared ? 'Shared' : 'Share'
  return (
    <PageHeader>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-medium" title={chat.title}>
          {chat.title}
        </h1>
        <p className="text-muted-foreground truncate text-xs">
          <Link to="/personas" className="hover:underline">
            {chat.personaName}
          </Link>
          <span> · {chat.personaModelId}</span>
        </p>
      </div>
      <Button
        variant={chat.isShared ? 'secondary' : 'ghost'}
        size="sm"
        onClick={() => setShareOpen(true)}
        aria-label={shareLabel}
        title={chat.isShared ? 'Shared — manage link' : 'Share'}
        className="max-sm:size-8 max-sm:px-0 pointer-coarse:max-sm:size-10"
      >
        {chat.isShared ? <Link2 data-icon="inline-start" /> : <Share2 data-icon="inline-start" />}
        <span className="max-sm:sr-only">{shareLabel}</span>
      </Button>
      <ShareDialog chatId={chat.id} open={shareOpen} onOpenChange={setShareOpen} />
    </PageHeader>
  )
}
