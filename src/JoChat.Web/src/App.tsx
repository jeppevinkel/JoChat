import { Route, Routes } from 'react-router'
import { useAuth } from 'react-oidc-context'
import { ChatsProvider } from '@/lib/chats-context'
import { ChatView } from '@/components/app/ChatView'
import { Login } from '@/components/app/Login'
import { Sidebar } from '@/components/app/Sidebar'

function Empty() {
  return (
    <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
      Pick a chat or start a new one.
    </div>
  )
}

export default function App() {
  const auth = useAuth()

  if (auth.isLoading) {
    return <div className="text-muted-foreground flex h-full items-center justify-center text-sm">Loading…</div>
  }
  if (!auth.isAuthenticated) return <Login />

  return (
    <ChatsProvider>
      <div className="flex h-full">
        <Sidebar />
        <main className="flex min-w-0 flex-1">
          <Routes>
            <Route path="/" element={<Empty />} />
            <Route path="/chats/:id" element={<ChatView />} />
          </Routes>
        </main>
      </div>
    </ChatsProvider>
  )
}
