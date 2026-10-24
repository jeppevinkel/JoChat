import { createContext, useContext } from 'react'

/** Resolves an attachment id to an object URL; swapped out on the public share page. */
export type AttachmentResolver = (id: string) => Promise<string>

export const AttachmentSourceContext = createContext<AttachmentResolver | null>(null)

export function useAttachmentResolver(): AttachmentResolver {
  const r = useContext(AttachmentSourceContext)
  if (!r) throw new Error('AttachmentSourceContext is not provided')
  return r
}
