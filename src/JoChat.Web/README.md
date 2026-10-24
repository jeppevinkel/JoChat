# JoChat.Web

React + Vite + TypeScript front end for the JoChat API. Tailwind CSS v4 with shadcn/ui
components; sign-in is Authorization Code + PKCE against Authentik via `react-oidc-context`.

## Running locally

```sh
# in another terminal: the API on http://localhost:5073
dotnet run --project ../JoChat.Api

npm install
npm run dev        # http://localhost:5173, proxies /api -> localhost:5073
```

`npm run build` type-checks and bundles to `dist/`; `npm run lint` runs oxlint.

## Authentik requirements

The client reads its OIDC settings at startup from `GET /api/config` (served by the API from
`Oidc:Authority` / `Oidc:ClientId`), so nothing is baked into the bundle. The provider must be a
**public** client with `<origin>/` registered as a redirect URI (strict match, trailing slash
included) for every origin the UI is served from. The client requests `offline_access` so
Authentik issues a refresh token; the session is kept in `localStorage` and renewed silently,
and a browser that has signed in before is sent straight back through Authentik (its own
session cookie makes that a silent round-trip) rather than shown the login card.

## Layout

- `src/auth.ts` — runtime config fetch and OIDC settings.
- `src/lib/api.ts` — typed API client; `sendMessage` consumes the SSE stream (`text` /
  `completed` / `error` events) via `fetch`, because `EventSource` can't POST or send a bearer token.
- `src/lib/chats-context.tsx`, `src/lib/use-chats.ts` — shared chat list state.
- `src/components/app/` — `Sidebar`, `ChatView`, `NewChatDialog`, `MessageBubble`, `Login`.
- `src/components/ui/` — generated shadcn/ui components.
