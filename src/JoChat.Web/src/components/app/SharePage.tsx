import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from 'react-oidc-context'
import { Copy, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ApiError, useApi, type Persona, type SharedChat } from '@/lib/api'
import { AttachmentSourceContext } from '@/lib/attachment-source'
import { selectClass } from '@/lib/persona'
import { messageImages } from '@/lib/use-image-gallery'
import { ImageGalleryProvider } from './ImageViewer'
import { MessageBubble } from './MessageBubble'

export default function SharePage() {
  const { token = '' } = useParams<{ token: string }>()
  const api = useApi()
  const auth = useAuth()
  const navigate = useNavigate()
  const [chat, setChat] = useState<SharedChat | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'unauthorized' | 'notfound' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [cloning, setCloning] = useState(false)
  const [pickPersona, setPickPersona] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.share
      .view(token)
      .then((c) => {
        if (cancelled) return
        setChat(c)
        setStatus('ok')
      })
      .catch((e) => {
        if (cancelled) return
        if (e instanceof ApiError && e.status === 401) setStatus('unauthorized')
        else if (e instanceof ApiError && e.status === 404) setStatus('notfound')
        else {
          setStatus('error')
          setError(e instanceof Error ? e.message : String(e))
        }
      })
    return () => {
      cancelled = true
    }
  }, [api, token, auth.isAuthenticated])

  const resolver = useMemo(() => (id: string) => api.share.attachmentBlobUrl(token, id), [api, token])
  const gallery = useMemo(() => chat?.messages.flatMap(messageImages) ?? [], [chat])

  const title = chat?.title
  useEffect(() => {
    if (!title) return
    document.title = `${title} · JoChat`
    return () => {
      document.title = 'JoChat'
    }
  }, [title])

  const clone = async (personaId?: string) => {
    setCloning(true)
    setError(null)
    try {
      const { id } = await api.share.clone(token, personaId)
      navigate(`/chats/${id}`)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && !personaId) setPickPersona(true)
      else setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCloning(false)
    }
  }

  const signIn = () => {
    localStorage.setItem('jochat:signed-in', '1')
    void auth.signinRedirect({ state: window.location.pathname })
  }

  if (status === 'loading') {
    return <Centered>Loading…</Centered>
  }
  if (status === 'notfound') {
    return <Centered>This link is no longer valid.</Centered>
  }
  if (status === 'unauthorized') {
    return (
      <Centered>
        <p>This chat is shared with signed-in users only.</p>
        <Button onClick={signIn} disabled={auth.isLoading}>
          <LogIn data-icon="inline-start" />
          Sign in to view
        </Button>
      </Centered>
    )
  }
  if (status === 'error' || !chat) {
    return <Centered className="text-destructive">{error ?? 'Something went wrong.'}</Centered>
  }

  return (
    <AttachmentSourceContext.Provider value={resolver}>
      <ImageGalleryProvider items={gallery}>
        <div className="flex h-full flex-col">
          <header className="border-border flex min-h-12 items-center gap-2 border-b px-3 py-1.5 sm:gap-3 sm:px-4">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-medium" title={chat.title}>
                {chat.title}
              </h1>
              <p className="text-muted-foreground truncate text-xs">
                Shared{chat.ownerName ? ` by ${chat.ownerName}` : ''}
                {chat.persona ? ` · ${chat.persona.name} (${chat.persona.modelId})` : ''} · read-only
              </p>
            </div>
            {auth.isAuthenticated ? (
              <>
                <Button variant="outline" size="sm" onClick={() => clone()} disabled={cloning} aria-label="Clone to my chats" title="Clone to my chats" className="pointer-coarse:h-9">
                  <Copy data-icon="inline-start" />
                  <span className="max-sm:hidden">Clone to my chats</span>
                  <span className="sm:hidden">Clone</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="pointer-coarse:h-9">
                  <span className="max-sm:hidden">Open JoChat</span>
                  <span className="sm:hidden">JoChat</span>
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={signIn} disabled={auth.isLoading} className="pointer-coarse:h-9">
                <LogIn data-icon="inline-start" />
                Sign in
              </Button>
            )}
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="mx-auto flex max-w-3xl flex-col gap-2 px-3 py-4 sm:px-4 sm:py-6">
              {chat.persona?.description && <p className="text-muted-foreground text-center text-xs">{chat.persona.description}</p>}
              {chat.messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={{ id: m.id, role: m.role, content: m.content, attachments: m.attachments, steps: m.toolActivity ?? undefined }}
                />
              ))}
              {error && <p className="text-destructive text-sm">{error}</p>}
            </div>
          </div>
          <PersonaPicker open={pickPersona} onOpenChange={setPickPersona} onPick={(id) => { setPickPersona(false); void clone(id) }} />
        </div>
      </ImageGalleryProvider>
    </AttachmentSourceContext.Provider>
  )
}

function Centered({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`text-muted-foreground flex h-full flex-col items-center justify-center gap-3 p-6 text-sm ${className ?? ''}`}>
      {children}
      <Link to="/" className="text-xs underline">
        JoChat
      </Link>
    </div>
  )
}

// Shown when the original persona isn't available to the cloner.
function PersonaPicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (id: string) => void }) {
  const api = useApi()
  const [personas, setPersonas] = useState<Persona[]>([])
  const [selected, setSelected] = useState('')
  useEffect(() => {
    if (!open) return
    let cancelled = false
    api.personas().then((p) => {
      if (cancelled) return
      setPersonas(p)
      setSelected((s) => s || p[0]?.id || '')
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open, api])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Choose a persona</DialogTitle>
          <DialogDescription>The persona used in this chat isn't available to you. The copy will continue with one of yours.</DialogDescription>
        </DialogHeader>
        {personas.length === 0 ? (
          <p className="text-sm">
            You have no personas yet — <Link to="/personas" className="underline">create one</Link> first.
          </p>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor="clone-persona">Persona</Label>
            <select id="clone-persona" className={selectClass} value={selected} onChange={(e) => setSelected(e.target.value)}>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.modelId}
                </option>
              ))}
            </select>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onPick(selected)} disabled={!selected}>Clone</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
