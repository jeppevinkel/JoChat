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

The OIDC provider identified in `.env` (`VITE_OIDC_AUTHORITY`, `VITE_OIDC_CLIENT_ID`) must be a
**public** client with `http://localhost:5173/` registered as a redirect URI (strict match,
trailing slash included). Tokens are kept in `sessionStorage`, so each new tab signs in again.

## Layout

- `src/auth.ts` — OIDC settings.
- `src/lib/api.ts` — typed API client; `sendMessage` consumes the SSE stream (`text` /
  `completed` / `error` events) via `fetch`, because `EventSource` can't POST or send a bearer token.
- `src/lib/chats-context.tsx`, `src/lib/use-chats.ts` — shared chat list state.
- `src/components/app/` — `Sidebar`, `ChatView`, `NewChatDialog`, `MessageBubble`, `Login`.
- `src/components/ui/` — generated shadcn/ui components.
