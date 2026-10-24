import { useAuth } from 'react-oidc-context'
import { Button } from '@/components/ui/button'

export function Login() {
  const auth = useAuth()
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="bg-card text-card-foreground flex w-full max-w-80 flex-col gap-4 rounded-xl border p-6 shadow-sm">
        <div>
          <h1 className="font-heading text-xl font-semibold">JoChat</h1>
          <p className="text-muted-foreground text-sm">Sign in with your Authentik account to continue.</p>
        </div>
        {auth.error && <p className="text-destructive text-sm">{auth.error.message}</p>}
        <Button onClick={() => auth.signinRedirect()} disabled={auth.isLoading}>
          {auth.isLoading ? 'Signing in…' : 'Sign in'}
        </Button>
      </div>
    </div>
  )
}
