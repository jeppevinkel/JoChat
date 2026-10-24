import { useCallback, useSyncExternalStore } from 'react'

/** Live result of a CSS media query; correct on the first render, so layouts don't flash. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}

/** Matches Tailwind's `md` breakpoint: below it the sidebar becomes a drawer. */
export const DESKTOP_QUERY = '(min-width: 48rem)'

/** Touch-first devices: no hover, on-screen keyboard where Enter should insert a newline. */
export const COARSE_POINTER_QUERY = '(pointer: coarse)'
