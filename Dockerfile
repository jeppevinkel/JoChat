# syntax=docker/dockerfile:1.7
# Single image serving the API and the web client. Build context is the repo root.

# ---- web client -------------------------------------------------------------
FROM node:24-alpine AS web
WORKDIR /src/web
COPY src/JoChat.Web/package.json src/JoChat.Web/package-lock.json ./
RUN npm ci
COPY src/JoChat.Web/ ./
RUN npm run build -- --outDir /out/wwwroot --emptyOutDir

# ---- api --------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
WORKDIR /src
COPY JoChat.slnx ./
COPY src/JoChat.Core/JoChat.Core.csproj src/JoChat.Core/
COPY src/JoChat.Infrastructure/JoChat.Infrastructure.csproj src/JoChat.Infrastructure/
COPY src/JoChat.Providers/JoChat.Providers.csproj src/JoChat.Providers/
COPY src/JoChat.Api/JoChat.Api.csproj src/JoChat.Api/
RUN dotnet restore src/JoChat.Api/JoChat.Api.csproj
COPY src/JoChat.Core/ src/JoChat.Core/
COPY src/JoChat.Infrastructure/ src/JoChat.Infrastructure/
COPY src/JoChat.Providers/ src/JoChat.Providers/
COPY src/JoChat.Api/ src/JoChat.Api/
# The PublishSpa MSBuild target is skipped here (no Node in this stage); the web
# build above is copied in instead.
RUN dotnet publish src/JoChat.Api/JoChat.Api.csproj -c Release -o /out/app --no-restore -p:SkipSpaBuild=true

# ---- runtime ----------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
# curl is only for the HEALTHCHECK; the base image ships without it.
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=api /out/app ./
COPY --from=web /out/wwwroot ./wwwroot/
RUN mkdir -p /app/data && chown -R app:app /app/data
USER app
# Port 8080 comes from the base image (ASPNETCORE_HTTP_PORTS); override that variable to change it.
ENV ASPNETCORE_FORWARDEDHEADERS_ENABLED=true \
    Database__MigrateOnStartup=true \
    Storage__RootPath=/app/data/files
VOLUME ["/app/data"]
EXPOSE 8080
# Probe whatever port the app binds, so overriding it doesn't silently break the check.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://localhost:${ASPNETCORE_HTTP_PORTS%%;*}/healthz" || exit 1
ENTRYPOINT ["dotnet", "JoChat.Api.dll"]
