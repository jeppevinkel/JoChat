/** Where a new conversation is written before it exists: nothing is stored until it's sent. */
export const DRAFT_PATH = '/chats/new'

/** Location state for a draft; a fresh key per "New conversation" gives it a clean composer. */
export interface DraftState {
  draft: string
}

export function newDraftState(): DraftState {
  return { draft: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}` }
}
