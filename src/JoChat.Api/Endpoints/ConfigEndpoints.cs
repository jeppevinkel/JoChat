using JoChat.Core.Options;
using Microsoft.Extensions.Options;

namespace JoChat.Api.Endpoints;

public static class ConfigEndpoints
{
    /// <summary>
    /// Public, anonymous settings the web client needs before it can sign in. Serving them from
    /// the API means one built image works for any environment: configure the server, not the bundle.
    /// </summary>
    public static IEndpointRouteBuilder MapConfigEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/config", (IOptions<OidcOptions> oidc) => Results.Ok(new
        {
            oidc.Value.Authority,
            // Authentik sets the token audience to the client id, so one setting covers both.
            ClientId = oidc.Value.ClientId ?? oidc.Value.Audience,
        })).AllowAnonymous();
        return app;
    }
}
