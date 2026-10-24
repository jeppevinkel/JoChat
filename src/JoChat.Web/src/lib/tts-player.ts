import { useSyncExternalStore } from 'react'

// One shared audio player: a single message plays at a time, object URLs are cached per
// message (and never revoked while in use), and components subscribe to the current state.

export type PlayerStatus = 'idle' | 'loading' | 'playing'

interface PlayerState {
  messageId: string | null
  status: PlayerStatus
  error: { messageId: string; message: string } | null
}

let state: PlayerState = { messageId: null, status: 'idle', error: null }
let audio: HTMLAudioElement | null = null
let token = 0 // guards against a stale load finishing after stop()/another play()
const cache = new Map<string, string>()
const listeners = new Set<() => void>()

function emit(next: PlayerState) {
  state = next
  listeners.forEach((l) => l())
}

export function stop() {
  token++
  if (audio) {
    audio.pause()
    audio.onended = null
    audio.onerror = null
    audio = null
  }
  emit({ messageId: null, status: 'idle', error: state.error })
}

export async function play(messageId: string, load: () => Promise<string>) {
  stop()
  const mine = ++token
  emit({ messageId, status: 'loading', error: null })
  try {
    let url = cache.get(messageId)
    if (!url) {
      url = await load()
      cache.set(messageId, url)
    }
    if (mine !== token) return // superseded while loading
    const el = new Audio(url)
    audio = el
    el.onended = () => {
      if (audio === el) stop()
    }
    el.onerror = () => {
      if (audio === el) {
        cache.delete(messageId)
        stop()
        emit({ ...state, error: { messageId, message: 'Playback failed.' } })
      }
    }
    await el.play()
    if (mine === token) emit({ messageId, status: 'playing', error: null })
  } catch (e) {
    if (mine !== token) return
    cache.delete(messageId)
    emit({ messageId: null, status: 'idle', error: { messageId, message: e instanceof Error ? e.message : String(e) } })
  }
}

export function usePlayer(messageId: string): { status: PlayerStatus; error: string | null } {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
  return {
    status: s.messageId === messageId ? s.status : 'idle',
    error: s.error?.messageId === messageId ? s.error.message : null,
  }
}
