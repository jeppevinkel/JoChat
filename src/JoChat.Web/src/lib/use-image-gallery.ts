import { createContext, useContext } from 'react'
import type { AttachmentRef } from './api'

/** One image the full-size viewer can show: a stored attachment or a local object URL. */
export interface GalleryItem {
  key: string
  attachmentId?: string
  src?: string
  name: string
  width?: number | null
  height?: number | null
}

export interface ImageGallery {
  open: (key: string) => void
}

export const ImageGalleryContext = createContext<ImageGallery | null>(null)

export function useImageGallery(): ImageGallery {
  const ctx = useContext(ImageGalleryContext)
  if (!ctx) throw new Error('useImageGallery must be used within ImageGalleryProvider')
  return ctx
}

const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

export function isImageAttachment(a: AttachmentRef): boolean {
  return a.kind === 'UploadedImage' || a.kind === 'GeneratedImage'
}

/**
 * The images a message shows, in display order. Just-sent messages show their local previews
 * until the reload brings back the stored attachments.
 */
export function messageImages(m: { previewUrls?: string[]; attachments: AttachmentRef[] }): GalleryItem[] {
  if (m.previewUrls?.length) return m.previewUrls.map((src) => ({ key: src, src, name: 'image' }))
  return m.attachments.filter(isImageAttachment).map((a) => ({
    key: a.id,
    attachmentId: a.id,
    name: a.fileName ?? `image-${a.id.slice(0, 8)}.${EXTENSIONS[a.mimeType] ?? 'png'}`,
    width: a.width,
    height: a.height,
  }))
}
