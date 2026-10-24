import { useEffect, useState } from 'react'
import { useAttachmentResolver, type AttachmentResolver } from './attachment-source'

interface Entry {
  url: Promise<string>
  refs: number
  timer?: ReturnType<typeof setTimeout>
}

// Object URLs are shared by everything showing the same attachment (the thumbnail and the
// full-size viewer), so opening the viewer doesn't download the image again. Released URLs
// linger briefly so a remount (StrictMode, switching back to a chat) can pick them up again.
const caches = new WeakMap<AttachmentResolver, Map<string, Entry>>()
const RELEASE_DELAY_MS = 5_000

function acquire(resolve: AttachmentResolver, id: string): Entry {
  let cache = caches.get(resolve)
  if (!cache) caches.set(resolve, (cache = new Map()))
  let entry = cache.get(id)
  if (!entry) {
    const created: Entry = { url: resolve(id), refs: 0 }
    // A failed load isn't cached, so the next mount retries.
    created.url.catch(() => {
      if (cache.get(id) === created) cache.delete(id)
    })
    cache.set(id, (entry = created))
  }
  clearTimeout(entry.timer)
  entry.refs++
  return entry
}

function release(resolve: AttachmentResolver, id: string, entry: Entry) {
  if (--entry.refs > 0) return
  entry.timer = setTimeout(() => {
    const cache = caches.get(resolve)
    if (cache?.get(id) === entry) cache.delete(id)
    entry.url.then(URL.revokeObjectURL, () => {})
  }, RELEASE_DELAY_MS)
}

/** Object URL for an attachment through the current resolver (API or share link); null until loaded. */
export function useAttachmentUrl(id: string | undefined): { url: string | null; failed: boolean } {
  const resolve = useAttachmentResolver()
  const [state, setState] = useState<{ id: string; url: string | null; failed: boolean } | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    const entry = acquire(resolve, id)
    entry.url.then(
      (url) => !cancelled && setState({ id, url, failed: false }),
      () => !cancelled && setState({ id, url: null, failed: true }),
    )
    return () => {
      cancelled = true
      release(resolve, id, entry)
    }
  }, [resolve, id])

  return state && state.id === id ? state : { url: null, failed: false }
}
