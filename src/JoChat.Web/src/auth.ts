import { WebStorageStateStore } from 'oidc-client-ts'
import type { AuthProviderProps } from 'react-oidc-context'

// Authorization Code + PKCE against Authentik. The jo-chat provider must be a public
// client with `${origin}/` registered as a redirect URI.
export const oidcConfig: AuthProviderProps = {
  authority: import.meta.env.VITE_OIDC_AUTHORITY,
  client_id: import.meta.env.VITE_OIDC_CLIENT_ID,
  redirect_uri: `${window.location.origin}/`,
  post_logout_redirect_uri: `${window.location.origin}/`,
  scope: 'openid profile email',
  automaticSilentRenew: true,
  // Session storage keeps the token out of long-lived localStorage; a new tab re-authenticates.
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  onSigninCallback: () => {
    // Strip ?code=&state= from the URL after the redirect lands.
    window.history.replaceState({}, document.title, window.location.pathname)
  },
}
