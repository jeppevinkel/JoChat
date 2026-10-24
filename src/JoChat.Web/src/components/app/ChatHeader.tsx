import { useState } from 'react'
import { Link } from 'react-router'
import { Link2, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ChatSummary } from '@/lib/api'
import { ShareDialog } from './ShareDialog'

// Title plus the persona you're talking to; sharing lives here too.
export function ChatHeader({ chat }: { chat: ChatSummary }) {
  const [shareOpen, setShareOpen] = useState(false)
  return (
    <div className="border-border flex items-center gap-3 border-b px-4 py-2">
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
      <Button variant={chat.isShared ? 'secondary' : 'ghost'} size="sm" onClick={() => setShareOpen(true)} title={chat.isShared ? 'Shared — manage link' : 'Share'}>
        {chat.isShared ? <Link2 data-icon="inline-start" /> : <Share2 data-icon="inline-start" />}
        {chat.isShared ? 'Shared' : 'Share'}
      </Button>
      <ShareDialog chatId={chat.id} open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  )
}
