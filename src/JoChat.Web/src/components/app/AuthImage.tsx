import { useAttachmentUrl } from '@/lib/attachment-url'
import { cn } from '@/lib/utils'

// Loads an attachment through the current resolver (authenticated API, or a share link) and
// renders it from an object URL. Known dimensions size the placeholder so the chat doesn't jump
// when the image arrives.
export function AuthImage({
  id,
  alt,
  className,
  width,
  height,
}: {
  id: string
  alt?: string
  className?: string
  width?: number | null
  height?: number | null
}) {
  const { url, failed } = useAttachmentUrl(id)

  if (!url) {
    const sized = width && height ? { aspectRatio: `${width} / ${height}`, height: `min(16rem, ${height}px)` } : undefined
    return <div className={cn('bg-muted rounded-md', !sized && 'size-48', !failed && 'animate-pulse', className)} style={sized} />
  }
  return <img src={url} alt={alt ?? ''} className={cn('rounded-md object-contain', className)} />
}
