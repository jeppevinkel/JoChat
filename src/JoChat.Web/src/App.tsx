import { Suspense, lazy, useEffect, useMemo } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { useAuth } from 'react-oidc-context'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useApi } from '@/lib/api'
import { AttachmentSourceContext } from '@/lib/attachment-source'
import { ChatsProvider } from '@/lib/chats-context'
import { MeProvider } from '@/lib/me-context'
import { useIsAdmin } from '@/lib/use-me'
import { useShell } from '@/lib/use-shell'
import { AppShell } from '@/components/app/AppShell'
import { Seal } from '@/components/app/Brand'
import { ChatView } from '@/components/app/ChatView'
import { Login } from '@/components/app/Login'
import { PageHeader } from '@/components/app/PageHeader'

const PersonasPage = lazy(() => import('@/components/app/PersonasPage'))
const AdminPage = lazy(() => import('@/components/app/AdminPage'))
const AdminChatPage = lazy(() => import('@/components/app/AdminChatPage'))
const SharePage = lazy(() => import('@/components/app/SharePage'))

function Empty() {
  const { sidebarInline, newChat } = useShell()
  return (
    <>
      {!sidebarInline && <PageHeader />}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <Seal className="size-12 text-2xl" />
        <div className="grid gap-1">
          <p className="font-heading text-2xl font-semibold tracking-tight">Start a conversation</p>
          <p className="text-muted-foreground text-sm">Pick one from the sidebar, or begin a new one with any persona.</p>
        </div>
        <Button onClick={newChat} className="bg-accent-ink text-accent-ink-foreground hover:bg-accent-ink/85">
          <Plus data-icon="inline-start" />
          New conversation
        </Button>
      </div>
    </>
  )
}

// Hides the page from non-admins; the API enforces the SuperAdmin policy regardless.
function AdminRoute() {
  return useIsAdmin() ? <AdminPage /> : <Empty />
}

function AdminChatRoute() {
  return useIsAdmin() ? <AdminChatPage /> : <Empty />
}

function PageFallback() {
  return <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">Loading…</div>
}

// Remembers that this browser has signed in before, so an expired session is renewed through
// Authentik's own session (no password prompt) instead of landing on the login card.
const SIGNED_IN_KEY = 'jochat:signed-in'

export default function App() {
  return (
    <Suspense fallback={<div className="text-muted-foreground flex h-full items-center justify-center text-sm">Loading…</div>}>
      <Routes>
        {/* Public share links render without the sign-in gate. */}
        <Route path="/share/:token" element={<SharePage />} />
        <Route path="/*" element={<AuthenticatedApp />} />
      </Routes>
    </Suspense>
  )
}

// /login starts the OIDC redirect immediately. Linked from an Authentik launcher it signs the
// user in without a click, since Authentik already has a session for them.
function AutoLogin() {
  const auth = useAuth()
  useEffect(() => {
    if (auth.isLoading || auth.isAuthenticated || auth.activeNavigator) return
    localStorage.setItem(SIGNED_IN_KEY, '1')
    void auth.signinRedirect({ state: '/' })
  }, [auth])
  if (auth.isAuthenticated) return <Navigate to="/" replace />
  if (auth.error) return <Login />
  return <div className="text-muted-foreground flex h-full items-center justify-center text-sm">Signing in…</div>
}

function AuthenticatedApp() {
  const auth = useAuth()
  const api = useApi()
  const location = useLocation()
  const resolver = useMemo(() => (id: string) => api.attachmentBlobUrl(id), [api])

  useEffect(() => {
    if (auth.isAuthenticated) localStorage.setItem(SIGNED_IN_KEY, '1')
  }, [auth.isAuthenticated])

  const shouldResume =
    !auth.isLoading && !auth.isAuthenticated && !auth.activeNavigator && !auth.error && localStorage.getItem(SIGNED_IN_KEY) === '1'
  useEffect(() => {
    if (!shouldResume) return
    // Cleared first so a failed round-trip shows the login card rather than looping.
    localStorage.removeItem(SIGNED_IN_KEY)
    void auth.signinRedirect()
  }, [shouldResume, auth])

  if (location.pathname === '/login') return <AutoLogin />
  if (auth.isLoading || shouldResume) {
    return <div className="text-muted-foreground flex h-full items-center justify-center text-sm">Loading…</div>
  }
  if (!auth.isAuthenticated) return <Login />

  return (
    <AttachmentSourceContext.Provider value={resolver}>
      <MeProvider>
        <ChatsProvider>
          <AppShell>
            {/* Inner boundary so loading a lazy page keeps the sidebar on screen. */}
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<Empty />} />
                <Route path="/chats/:id" element={<ChatView />} />
                <Route path="/personas" element={<PersonasPage />} />
                <Route path="/admin" element={<AdminRoute />} />
                <Route path="/admin/chats/:id" element={<AdminChatRoute />} />
              </Routes>
            </Suspense>
          </AppShell>
        </ChatsProvider>
      </MeProvider>
    </AttachmentSourceContext.Provider>
  )
}
