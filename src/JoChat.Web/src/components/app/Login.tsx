import { useAuth } from 'react-oidc-context'
import { Button } from '@/components/ui/button'
import { Wordmark } from './Brand'

export function Login() {
  const auth = useAuth()
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="bg-card text-card-foreground flex w-full max-w-80 flex-col gap-5 rounded-lg border p-6 shadow-[0_8px_30px_-12px_color-mix(in_oklab,var(--foreground)_25%,transparent)]">
        <div className="grid gap-2">
          <h1>
            <Wordmark />
          </h1>
          <p className="text-muted-foreground text-sm">Sign in with your Authentik account to continue.</p>
        </div>
        {auth.error && <p className="text-destructive text-sm">{auth.error.message}</p>}
        <Button onClick={() => auth.signinRedirect()} disabled={auth.isLoading}>
          {auth.isLoading ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="text-muted-foreground text-xs">Conversations may be reviewed by administrators for moderation.</p>
      </div>
    </div>
  )
}
