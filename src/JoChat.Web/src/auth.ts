import { WebStorageStateStore } from 'oidc-client-ts'
import type { AuthProviderProps } from 'react-oidc-context'

// Authorization Code + PKCE against Authentik. The jo-chat provider must be a public
// client with `${origin}/` registered as a redirect URI.
const authority: string = import.meta.env.VITE_OIDC_AUTHORITY
// https://host/application/o/<slug>/  ->  https://host/application/o
const base = authority.replace(/\/[^/]+\/?$/, '')

export const oidcConfig: AuthProviderProps = {
  authority,
  client_id: import.meta.env.VITE_OIDC_CLIENT_ID,
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
