import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type TouchEvent } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { ChevronLeft, ChevronRight, Download, Loader2, X } from 'lucide-react'
import { useAttachmentUrl } from '@/lib/attachment-url'
import { ImageGalleryContext, type GalleryItem } from '@/lib/use-image-gallery'
import { cn } from '@/lib/utils'

// Horizontal travel (px) that counts as a swipe to the next/previous image.
const SWIPE_DISTANCE = 50

/**
 * Lets any thumbnail below open a full-screen viewer that pages through `items` — every image
 * in the conversation, so generated images can be flipped through without closing the viewer.
 */
export function ImageGalleryProvider({ items, children }: { items: GalleryItem[]; children: ReactNode }) {
  // The key outlives `open` so the closing animation still has an image to show.
  const [state, setState] = useState<{ key: string | null; open: boolean }>({ key: null, open: false })
  const gallery = useMemo(() => ({ open: (key: string) => setState({ key, open: true }) }), [])
  const index = state.key === null ? -1 : items.findIndex((i) => i.key === state.key)

  return (
    <ImageGalleryContext.Provider value={gallery}>
      {children}
      <ImageViewer
        items={items}
        index={index}
        open={state.open && index >= 0}
        onIndexChange={(i) => setState({ key: items[i].key, open: true })}
        onClose={() => setState((s) => ({ ...s, open: false }))}
      />
    </ImageGalleryContext.Provider>
  )
}

interface ViewerProps {
  items: GalleryItem[]
  index: number
  open: boolean
  onIndexChange: (index: number) => void
  onClose: () => void
}

function ImageViewer({ items, index, open, onIndexChange, onClose }: ViewerProps) {
  const item = index >= 0 ? items[index] : null
  const hasPrev = index > 0
  const hasNext = index >= 0 && index < items.length - 1
  const touchRef = useRef<{ x: number; y: number } | null>(null)
  const [zoomed, setZoomed] = useState(false)

  const go = (delta: number) => {
    const next = index + delta
    if (next < 0 || next >= items.length) return
    setZoomed(false)
    onIndexChange(next)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') go(-1)
    else if (e.key === 'ArrowRight') go(1)
  }
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]
    touchRef.current = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null
  }
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchRef.current
    const t = e.changedTouches[0]
    touchRef.current = null
    // Leave pinch-zoomed and zoomed-in views to panning.
    if (!start || !t || zoomed || (window.visualViewport?.scale ?? 1) > 1.01) return
    const dx = t.clientX - start.x
    if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(t.clientY - start.y) * 1.5) go(dx < 0 ? 1 : -1)
  }

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setZoomed(false)
          onClose()
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/90 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          className="fixed inset-0 z-50 text-white outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          onKeyDown={onKeyDown}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <DialogPrimitive.Title className="sr-only">{item?.name ?? 'Image'}</DialogPrimitive.Title>
          {item && <ViewerImage key={item.key} item={item} zoomed={zoomed} onZoomedChange={setZoomed} onClose={onClose} />}

          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent p-2 sm:p-3">
            <span className="min-w-0 flex-1 truncate pl-2 text-sm text-white/80 tabular-nums">
              {items.length > 1 && `${index + 1} / ${items.length}`}
            </span>
            {item && <DownloadLink item={item} />}
            <DialogPrimitive.Close className={toolbarButton} aria-label="Close">
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>

          {hasPrev && (
            <button type="button" aria-label="Previous image" onClick={() => go(-1)} className={cn(navButton, 'left-2 sm:left-4')}>
              <ChevronLeft className="size-6" />
            </button>
          )}
          {hasNext && (
            <button type="button" aria-label="Next image" onClick={() => go(1)} className={cn(navButton, 'right-2 sm:right-4')}>
              <ChevronRight className="size-6" />
            </button>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

const toolbarButton =
  'pointer-events-auto inline-flex size-10 items-center justify-center rounded-full text-white/90 hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none'
const navButton =
  'absolute top-1/2 z-10 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/90 hover:bg-black/70 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none'

function useItemSrc(item: GalleryItem) {
  const attachment = useAttachmentUrl(item.attachmentId)
  return { src: item.src ?? attachment.url, failed: attachment.failed }
}

function DownloadLink({ item }: { item: GalleryItem }) {
  const { src } = useItemSrc(item)
  if (!src) return null
  return (
    <a href={src} download={item.name} className={toolbarButton} aria-label="Download" title="Download">
      <Download className="size-5" />
    </a>
  )
}

// Fits the image to the screen; clicking an image larger than that shows it at full size
// (scrollable) with the clicked point kept under the cursor. Clicking the backdrop closes.
function ViewerImage({
  item,
  zoomed,
  onZoomedChange,
  onClose,
}: {
  item: GalleryItem
  zoomed: boolean
  onZoomedChange: (zoomed: boolean) => void
  onClose: () => void
}) {
  const { src, failed } = useItemSrc(item)
  const stageRef = useRef<HTMLDivElement>(null)
  const [zoomable, setZoomable] = useState(false)
  // Where the zoom click landed: fraction across the image and offset within the stage.
  const anchorRef = useRef<{ fx: number; fy: number; sx: number; sy: number } | null>(null)

  useLayoutEffect(() => {
    const stage = stageRef.current
    const anchor = anchorRef.current
    if (!zoomed || !stage || !anchor) return
    const img = stage.querySelector('img')
    if (!img) return
    stage.scrollLeft = anchor.fx * img.offsetWidth + img.offsetLeft - anchor.sx
    stage.scrollTop = anchor.fy * img.offsetHeight + img.offsetTop - anchor.sy
    anchorRef.current = null
  }, [zoomed])

  const onImageClick = (e: MouseEvent<HTMLImageElement>) => {
    if (zoomed) return onZoomedChange(false)
    if (!zoomable) return
    const rect = e.currentTarget.getBoundingClientRect()
    const stage = stageRef.current!.getBoundingClientRect()
    anchorRef.current = {
      fx: (e.clientX - rect.left) / rect.width,
      fy: (e.clientY - rect.top) / rect.height,
      sx: e.clientX - stage.left,
      sy: e.clientY - stage.top,
    }
    onZoomedChange(true)
  }

  return (
    <div
      ref={stageRef}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={cn(
        'absolute inset-0 flex overscroll-contain',
        zoomed ? 'overflow-auto' : 'items-center justify-center overflow-hidden px-2 pt-14 pb-4 sm:px-20 sm:pb-8',
      )}
    >
      {src ? (
        <img
          src={src}
          alt={item.name}
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget
            setZoomable(img.naturalWidth > img.clientWidth + 1 || img.naturalHeight > img.clientHeight + 1)
          }}
          onClick={onImageClick}
          className={cn(
            'select-none',
            // m-auto centres the full-size image while still letting it scroll from its edges.
            zoomed ? 'm-auto max-w-none cursor-zoom-out' : 'max-h-full max-w-full object-contain',
            !zoomed && zoomable && 'cursor-zoom-in',
          )}
        />
      ) : failed ? (
        <p className="text-sm text-white/70">Couldn't load this image.</p>
      ) : (
        <Loader2 className="size-8 animate-spin text-white/70" />
      )}
    </div>
  )
}
