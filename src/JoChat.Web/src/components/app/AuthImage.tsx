import { useEffect, useState } from 'react'
import { useAttachmentResolver } from '@/lib/attachment-source'
import { cn } from '@/lib/utils'

// Loads an attachment through the current resolver (authenticated API, or a share link) and
// renders it from an object URL.
export function AuthImage({ id, alt, className }: { id: string; alt?: string; className?: string }) {
  const resolve = useAttachmentResolver()
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    resolve(id).then((u) => {
      if (cancelled) URL.revokeObjectURL(u)
      else setUrl((objectUrl = u))
    }).catch(() => setUrl(null))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [resolve, id])

  if (!url) return <div className={cn('bg-muted animate-pulse rounded-md', className)} />
  return <img src={url} alt={alt ?? ''} className={cn('rounded-md object-contain', className)} />
}
