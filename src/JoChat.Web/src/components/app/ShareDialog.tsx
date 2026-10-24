import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useApi, type ShareInfo } from '@/lib/api'
import { useChats } from '@/lib/use-chats'

export function ShareDialog({ chatId, open, onOpenChange }: { chatId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const api = useApi()
  const { refresh } = useChats()
  const [share, setShare] = useState<ShareInfo | null | undefined>(undefined) // undefined = loading
  const [allowAnonymous, setAllowAnonymous] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    api.share
      .get(chatId)
      .then((s) => {
        if (cancelled) return
        setShare(s ?? null)
        setAllowAnonymous(s?.allowAnonymous ?? false)
        setError(null)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [open, api, chatId])

  const link = share ? `${window.location.origin}/share/${share.token}` : ''

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      setShare(await api.share.set(chatId, allowAnonymous))
      void refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const revoke = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.share.revoke(chatId)
      setShare(null)
      void refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const copy = async () => {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const dirty = share !== null && share !== undefined && share.allowAnonymous !== allowAnonymous

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share chat</DialogTitle>
          <DialogDescription>
            A read-only, live view of this conversation. The persona's system prompt is never shown.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="grid gap-2 text-sm">
          <label className="flex items-start gap-2">
            <input type="radio" name="share-access" className="accent-primary mt-1" checked={!allowAnonymous} onChange={() => setAllowAnonymous(false)} />
            <span>
              <span className="font-medium">Signed-in users only</span>
              <span className="text-muted-foreground block text-xs">Viewers need a JoChat account.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="share-access" className="accent-primary mt-1" checked={allowAnonymous} onChange={() => setAllowAnonymous(true)} />
            <span>
              <span className="font-medium">Anyone with the link</span>
              <span className="text-muted-foreground block text-xs">No account needed. Anyone who has the link can read the chat.</span>
            </span>
          </label>
        </fieldset>

        {share && (
          <div className="flex items-center gap-2">
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            <Button variant="outline" size="icon" aria-label="Copy link" onClick={copy}>
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
        )}
        {error && <p className="text-destructive text-sm">{error}</p>}

        <DialogFooter>
          {share && (
            <Button variant="ghost" onClick={revoke} disabled={busy}>
              Stop sharing
            </Button>
          )}
          <Button onClick={save} disabled={busy || share === undefined || (share !== null && !dirty)}>
            {share ? 'Update' : 'Create link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
