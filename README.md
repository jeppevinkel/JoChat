# JoChat

Self-hosted chat front end for Claude with personas, image generation and text-to-speech.
ASP.NET Core 10 API + React web client, PostgreSQL, Authentik for sign-in (OIDC) and user
provisioning (SCIM).

## Development

```sh
docker compose up -d                                   # PostgreSQL on localhost:5432
dotnet user-secrets set "Anthropic:ApiKey" "sk-ant-…" --project src/JoChat.Api
dotnet run --project src/JoChat.Api                    # API on http://localhost:5073, applies migrations
cd src/JoChat.Web && npm install && npm run dev        # UI on http://localhost:5173 (proxies /api)
```

Development settings live in `src/JoChat.Api/appsettings.Development.json`; secrets go in
user secrets (or environment variables), never in the repo. The Authentik provider must be a
public OIDC client with `http://localhost:5173/` as a redirect URI; SCIM pushes to
`<api>/v2` with the token from `Scim:Token`.

Migrations: `dotnet ef migrations add <Name> -o Migrations/Postgres -p src/JoChat.Infrastructure -s src/JoChat.Api`.

## Production

`dotnet publish src/JoChat.Api -c Release` builds the web client into `wwwroot` and produces
one deployable that serves both the API and the SPA from a single origin. All settings are
read from environment variables (ASP.NET Core maps `Section__Key` to `Section:Key`); nothing
is baked into the web bundle — it fetches its public OIDC settings from `GET /api/config`.

| Variable | Required | Purpose |
|---|---|---|
| `ConnectionStrings__Default` | yes | PostgreSQL, e.g. `Host=db;Database=jochat;Username=jochat;Password=…` |
| `Oidc__Authority` | yes | Authentik provider issuer, e.g. `https://auth.example.com/application/o/jo-chat/` |
| `Oidc__Audience` | yes | Expected token audience — Authentik uses the OAuth client id |
| `Oidc__ClientId` | no | Client id handed to the browser; defaults to `Oidc__Audience` |
| `Scim__Token` | yes | Bearer token Authentik's SCIM provider must present |
| `AuthorizationGroups__UserGroup` | no | Group granting access (default `jochat-users`) |
| `AuthorizationGroups__SuperAdminGroup` | no | Group granting admin (default `jochat-superadmins`) |
| `Anthropic__ApiKey` | yes | Chat models |
| `OpenAi__ApiKey` | for images / OpenAI TTS | `OpenAi__ImageModel` (default `gpt-image-2`), `OpenAi__TtsModel` (default `gpt-4o-mini-tts`) |
| `ElevenLabs__ApiKey` | for ElevenLabs TTS | |
| `Storage__RootPath` | no | Directory for uploads, generated images and cached audio (default `data/files`); mount a volume |
| `Storage__MaxUploadBytes` | no | Upload cap (default 10 MiB) |
| `RateLimits__ChatPerMinute` etc. | no | Per-user limits: `ChatPerMinute` 30, `ImagePerMinute` 6, `TtsPerMinute` 30, `UploadPerMinute` 30 |
| `Cors__Origins__0` | only if the UI is on another origin | Not needed when the API serves the SPA |
| `ASPNETCORE_URLS` | no | e.g. `http://0.0.0.0:8080` behind a reverse proxy |

Migrations are applied automatically only in Development; in production run
`dotnet ef database update` (or start once with `ASPNETCORE_ENVIRONMENT=Development` against
the target database) as part of the deploy.

## Layout

- `src/JoChat.Core` — entities, options, provider abstractions.
- `src/JoChat.Infrastructure` — EF Core (PostgreSQL), identity/current user, file storage, migrations.
- `src/JoChat.Providers` — Anthropic (official SDK), OpenAI images/TTS, ElevenLabs TTS.
- `src/JoChat.Api` — minimal API endpoints, chat streaming (SSE), SCIM/OIDC wiring, rate limits.
- `src/JoChat.Web` — React client (see its README).
