import { Suspense, lazy, useEffect, useMemo } from 'react'
import { Route, Routes } from 'react-router'
import { useAuth } from 'react-oidc-context'
import { useApi } from '@/lib/api'
import { AttachmentSourceContext } from '@/lib/attachment-source'
import { ChatsProvider } from '@/lib/chats-context'
import { MeProvider } from '@/lib/me-context'
import { useIsAdmin } from '@/lib/use-me'
import { ChatView } from '@/components/app/ChatView'
import { Login } from '@/components/app/Login'
import { Sidebar } from '@/components/app/Sidebar'

const PersonasPage = lazy(() => import('@/components/app/PersonasPage'))
const AdminPage = lazy(() => import('@/components/app/AdminPage'))
const SharePage = lazy(() => import('@/components/app/SharePage'))

function Empty() {
  return (
    <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
      Pick a chat or start a new one.
    </div>
  )
}

// Hides the page from non-admins; the API enforces the SuperAdmin policy regardless.
function AdminRoute() {
  return useIsAdmin() ? <AdminPage /> : <Empty />
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

function AuthenticatedApp() {
  const auth = useAuth()
  const api = useApi()
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

  if (auth.isLoading || shouldResume) {
    return <div className="text-muted-foreground flex h-full items-center justify-center text-sm">Loading…</div>
  }
  if (!auth.isAuthenticated) return <Login />

  return (
    <AttachmentSourceContext.Provider value={resolver}>
      <MeProvider>
        <ChatsProvider>
          <div className="flex h-full">
            <Sidebar />
            <main className="flex min-w-0 flex-1">
              <Routes>
                <Route path="/" element={<Empty />} />
                <Route path="/chats/:id" element={<ChatView />} />
                <Route path="/personas" element={<PersonasPage />} />
                <Route path="/admin" element={<AdminRoute />} />
              </Routes>
            </main>
          </div>
        </ChatsProvider>
      </MeProvider>
    </AttachmentSourceContext.Provider>
  )
}
