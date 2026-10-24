using System.Threading.RateLimiting;
using JoChat.Api;
using JoChat.Api.Auth;
using JoChat.Api.Endpoints;
using JoChat.Api.Services;
using JoChat.Core.Constants;
using JoChat.Core.Entities;
using JoChat.Core.Options;
using JoChat.Infrastructure;
using JoChat.Infrastructure.Persistence;
using JoChat.Providers;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using ScimSlim.EntityFramework;
using ScimSlim.Extensions;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddJoChatInfrastructure(builder.Configuration);
builder.Services.AddJoChatProviders(builder.Configuration);
builder.Services.AddScoped<IChatStreamingService, ChatStreamingService>();
builder.Services.AddScoped<ImagePromptWriter>();

// SCIM provisioning (Authentik -> JoChat)
builder.Services.AddScim<EfScimUserStore, EfScimGroupStore>(opts =>
{
    opts.StaticToken = builder.Configuration["Scim:Token"]!;
    opts.SupportPatch = true;
});
builder.Services.AddScimEntityFrameworkStores<AppDbContext>();

// OIDC bearer auth (Authentik-issued JWTs for the React app)
builder.Services.Configure<OidcOptions>(builder.Configuration.GetSection(OidcOptions.Section));
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.Authority = builder.Configuration["Oidc:Authority"];
        o.Audience = builder.Configuration["Oidc:Audience"];
        o.MapInboundClaims = false; // keep "sub" as "sub"
    });

builder.Services.Configure<AuthorizationGroupOptions>(
    builder.Configuration.GetSection(AuthorizationGroupOptions.Section));
builder.Services.AddTransient<IClaimsTransformation, ScimGroupClaimsTransformation>();

builder.Services.AddAuthorizationBuilder()
    .AddPolicy(Policies.User, p => p
        .RequireAuthenticatedUser()
        .RequireRole(JoChatRoles.User, JoChatRoles.SuperAdmin))
    .AddPolicy(Policies.SuperAdmin, p => p
        .RequireAuthenticatedUser()
        .RequireRole(JoChatRoles.SuperAdmin));

builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [])
    .AllowAnyHeader().AllowAnyMethod()));

// Per-user limits on the endpoints that call paid providers; keyed by the OIDC sub so one
// user can't exhaust another's quota, with the client IP as fallback for anonymous requests.
builder.Services.Configure<RateLimitOptions>(builder.Configuration.GetSection(RateLimitOptions.Section));
var rateLimits = builder.Configuration.GetSection(RateLimitOptions.Section).Get<RateLimitOptions>() ?? new();
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = (ctx, _) =>
    {
        if (ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
            ctx.HttpContext.Response.Headers.RetryAfter = ((int)retryAfter.TotalSeconds).ToString();
        return ValueTask.CompletedTask;
    };
    o.AddPolicy(RatePolicies.Chat, ctx => PerUser(ctx, rateLimits.ChatPerMinute));
    o.AddPolicy(RatePolicies.Image, ctx => PerUser(ctx, rateLimits.ImagePerMinute));
    o.AddPolicy(RatePolicies.Tts, ctx => PerUser(ctx, rateLimits.TtsPerMinute));
    o.AddPolicy(RatePolicies.Upload, ctx => PerUser(ctx, rateLimits.UploadPerMinute));
});
builder.Services.AddOpenApi();

var app = builder.Build();

// Serve the built web client (JoChat.Web -> wwwroot, see the PublishSpa target) when present.
// Static files must run before routing: WebApplication otherwise inserts routing first, the SPA
// fallback endpoint matches /assets/*, and the static file middleware steps aside.
var spaRoot = Path.Combine(app.Environment.ContentRootPath, "wwwroot");
var serveSpa = File.Exists(Path.Combine(spaRoot, "index.html"));
if (serveSpa)
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
}
app.UseRouting();

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();

    // Auto-apply pending migrations locally so the dev database stays current.
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();

    // Personas can only target enabled ModelDefinitions, so give a fresh dev DB something to pick.
    if (!db.ModelDefinitions.Any())
    {
        db.ModelDefinitions.AddRange(
            new ModelDefinition { Id = Guid.NewGuid(), Provider = "anthropic", ModelId = "claude-opus-5-5", DisplayName = "Claude Opus 5.5", SupportsVision = true },
            new ModelDefinition { Id = Guid.NewGuid(), Provider = "anthropic", ModelId = "claude-sonnet-5-5", DisplayName = "Claude Sonnet 5.5", SupportsVision = true },
            new ModelDefinition { Id = Guid.NewGuid(), Provider = "anthropic", ModelId = "claude-haiku-5-5", DisplayName = "Claude Haiku 5.5", SupportsVision = true });
        db.SaveChanges();
    }
}

app.UseHttpsRedirection();

// SPA fallback for client-side routes. API, SCIM and OpenAPI paths are excluded so a wrong
// API URL still yields a 404 rather than index.html.
if (serveSpa)
    app.MapFallbackToFile("{*path:regex(^(?!api(/|$)|v2(/|$)|openapi(/|$)).*$)}", "index.html");

app.MapScim("/v2"); // Authentik SCIM provider points here; uses its own ScimToken scheme
app.MapConfigEndpoints();

var api = app.MapGroup("/api").RequireAuthorization(Policies.User);
api.MapMeEndpoints();
api.MapPersonaEndpoints();
api.MapModelEndpoints();
api.MapChatEndpoints();
api.MapAttachmentEndpoints();
api.MapImageEndpoints();
api.MapTtsEndpoints();

app.MapGroup("/api/admin").RequireAuthorization(Policies.SuperAdmin)
    .MapAdminEndpoints(); // empty for now

app.Run();

static RateLimitPartition<string> PerUser(HttpContext ctx, int perMinute)
{
    var key = ctx.User.FindFirst("sub")?.Value
              ?? ctx.Connection.RemoteIpAddress?.ToString()
              ?? "anonymous";
    return RateLimitPartition.GetSlidingWindowLimiter(key, _ => new SlidingWindowRateLimiterOptions
    {
        PermitLimit = perMinute,
        Window = TimeSpan.FromMinutes(1),
        SegmentsPerWindow = 6,
        QueueLimit = 0,
    });
}
