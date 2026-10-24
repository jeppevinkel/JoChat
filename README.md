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

JoChat ships as one container image (API + web client) built by GitHub Actions and published to
GHCR: pushes to `main` produce `ghcr.io/jeppevinkel/jochat:main` and `:sha-<short>`; a tag `vX.Y.Z`
produces `:X.Y.Z`, `:X.Y` and `:latest`. `deploy/docker-compose.yml` runs it with PostgreSQL.

```sh
# on the Docker host
mkdir jochat && cd jochat
curl -O https://raw.githubusercontent.com/jeppevinkel/jochat/main/deploy/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/jeppevinkel/jochat/main/deploy/.env.example
$EDITOR .env                       # image, DB password, Authentik, API keys
docker compose up -d
```

Cut a release with `git tag v1.0.0 && git push --tags`; update with `docker compose pull && docker compose up -d`.
If the GHCR package is private, `docker login ghcr.io` on the host with a token that has `read:packages`.

Ingress: the app listens on plain HTTP (8080) and expects TLS to terminate in front of it. With
Cloudflare Tunnel, attach the `cloudflared` container to the `jochat` network and point the public
hostname at `http://jochat:8080`; register `https://<hostname>/` as a redirect URI on the Authentik
provider and point its SCIM provider at `https://<hostname>/v2`. `X-Forwarded-*` headers are honoured.

Migrations run automatically on container start (`Database__MigrateOnStartup=true` is set in the
image); the default model list is seeded into an empty database. Uploads, generated images and
cached audio live in the `data` volume.

All settings are environment variables (ASP.NET Core maps `Section__Key` to `Section:Key`); the
compose file wires the ones below from `.env`. Nothing is baked into the web bundle — it fetches
its public OIDC settings from `GET /api/config`.

| Variable | Required | Purpose |
|---|---|---|
| `ConnectionStrings__Default` | yes | PostgreSQL, e.g. `Host=postgres;Database=jochat;Username=jochat;Password=…` |
| `Oidc__Authority` | yes | Authentik provider issuer, e.g. `https://auth.example.com/application/o/jo-chat/` |
| `Oidc__Audience` | yes | Expected token audience — Authentik uses the OAuth client id |
| `Oidc__ClientId` | no | Client id handed to the browser; defaults to `Oidc__Audience` |
| `Scim__Token` | yes | Bearer token Authentik's SCIM provider must present |
| `AuthorizationGroups__UserGroup` | no | Group granting access (default `jochat-users`) |
| `AuthorizationGroups__SuperAdminGroup` | no | Group granting admin (default `jochat-superadmins`) |
| `Anthropic__ApiKey` | yes | Chat models |
| `OpenAi__ApiKey` | for images / OpenAI TTS | `OpenAi__ImageModel` (default `gpt-image-2`), `OpenAi__TtsModel` (default `gpt-4o-mini-tts`) |
| `ElevenLabs__ApiKey` | for ElevenLabs TTS | |
| `Storage__RootPath` | no | Directory for uploads, generated images and cached audio (image default `/app/data/files`) |
| `Storage__MaxUploadBytes` | no | Upload cap (default 10 MiB) |
| `RateLimits__ChatPerMinute` etc. | no | Per-user limits: `ChatPerMinute` 30, `ImagePerMinute` 6, `TtsPerMinute` 30, `UploadPerMinute` 30 |
| `Database__MigrateOnStartup` | no | Apply migrations at startup (image default `true`) |
| `ASPNETCORE_HTTP_PORTS` | no | Listening port (image default `8080`) |

Without Docker, `dotnet publish src/JoChat.Api -c Release` still produces a single deployable with
the web client in `wwwroot` (requires Node on the build machine); run migrations with
`dotnet ef database update` or set `Database__MigrateOnStartup=true`.

## Layout

- `src/JoChat.Core` — entities, options, provider abstractions.
- `src/JoChat.Infrastructure` — EF Core (PostgreSQL), identity/current user, file storage, migrations.
- `src/JoChat.Providers` — Anthropic (official SDK), OpenAI images/TTS, ElevenLabs TTS.
- `src/JoChat.Api` — minimal API endpoints, chat streaming (SSE), SCIM/OIDC wiring, rate limits.
- `src/JoChat.Web` — React client (see its README).
