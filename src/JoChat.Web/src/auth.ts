import { WebStorageStateStore } from 'oidc-client-ts'
import type { AuthProviderProps } from 'react-oidc-context'

export interface RuntimeConfig {
  authority: string
  clientId: string
}

// Public settings come from the API (GET /api/config) so one built bundle works in any
// environment; the server is configured, not the bundle.
export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const res = await fetch('/api/config')
  if (!res.ok) throw new Error(`Could not load /api/config (${res.status})`)
  const cfg = (await res.json()) as RuntimeConfig
  if (!cfg.authority || !cfg.clientId) throw new Error('OIDC authority/client id are not configured on the server.')
  return cfg
}

// Authorization Code + PKCE against Authentik. The provider must be a public client with
// `${origin}/` registered as a redirect URI.
export function oidcConfig({ authority, clientId }: RuntimeConfig): AuthProviderProps {
  // https://host/application/o/<slug>/  ->  https://host/application/o
  const base = authority.replace(/\/[^/]+\/?$/, '')
  return {
    authority,
    client_id: clientId,
    redirect_uri: `${window.location.origin}/`,
    post_logout_redirect_uri: `${window.location.origin}/`,
    scope: 'openid profile email',
    // Authentik serves .well-known/openid-configuration without CORS headers (the token and
    // other endpoints do send them), so discovery from the browser fails. Supplying the
    // metadata statically skips that request; the URLs follow Authentik's fixed layout.
    metadata: {
      issuer: authority,
      authorization_endpoint: `${base}/authorize/`,
      token_endpoint: `${base}/token/`,
      userinfo_endpoint: `${base}/userinfo/`,
      revocation_endpoint: `${base}/revoke/`,
      end_session_endpoint: `${authority}end-session/`,
      jwks_uri: `${authority}jwks/`,
    },
    automaticSilentRenew: true,
    // Session storage keeps the token out of long-lived localStorage; a new tab re-authenticates.
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    onSigninCallback: () => {
      // Strip ?code=&state= from the URL after the redirect lands.
      window.history.replaceState({}, document.title, window.location.pathname)
    },
  }
}
