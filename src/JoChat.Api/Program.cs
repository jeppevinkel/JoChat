using JoChat.Api.Auth;
using JoChat.Api.Endpoints;
using JoChat.Api.Services;
using JoChat.Core.Constants;
using JoChat.Core.Options;
using JoChat.Infrastructure;
using JoChat.Infrastructure.Persistence;
using JoChat.Providers;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using ScimSlim.EntityFramework;
using ScimSlim.Extensions;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddJoChatInfrastructure(builder.Configuration);
builder.Services.AddJoChatProviders(builder.Configuration);
builder.Services.AddScoped<IChatStreamingService, ChatStreamingService>();

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

builder.Services.AddRateLimiter(o => { /* TODO: partition by sub on expensive endpoints */ });
builder.Services.AddOpenApi();

var app = builder.Build();

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.MapScim("/v2"); // Authentik SCIM provider points here; uses its own ScimToken scheme

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