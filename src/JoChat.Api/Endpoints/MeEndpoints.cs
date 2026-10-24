using System.Security.Claims;
using JoChat.Core.Abstractions;
using JoChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JoChat.Api.Endpoints;

public static class MeEndpoints
{
    public static RouteGroupBuilder MapMeEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/me", async (ClaimsPrincipal principal, ICurrentUserService current, CancellationToken ct) =>
        {
            var user = await current.GetRequiredUserAsync(ct);
            return Results.Ok(new
            {
                user.Id, user.ExternalId, user.DisplayName, user.DefaultPersonaId, user.CreatedAt,
                Roles = principal.FindAll(ClaimTypes.Role).Select(c => c.Value).ToList(),
            });
        });

        group.MapPatch("/me", async (UpdateMeRequest req, AppDbContext db,
            ICurrentUserService current, CancellationToken ct) =>
        {
            var user = await current.GetRequiredUserAsync(ct);

            if (req.DisplayName is not null)
                user.DisplayName = string.IsNullOrWhiteSpace(req.DisplayName) ? null : req.DisplayName.Trim();

            if (req.DefaultPersonaId is { } personaId)
            {
                var usable = await db.Personas
                    .AnyAsync(p => p.Id == personaId && (p.OwnerId == user.Id || p.IsShared), ct);
                if (!usable)
                    return Results.Problem("Persona not found.", statusCode: StatusCodes.Status400BadRequest);
                user.DefaultPersonaId = personaId;
            }
            else if (req.ClearDefaultPersona)
            {
                user.DefaultPersonaId = null;
            }

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { user.Id, user.DisplayName, user.DefaultPersonaId });
        });
        return group;
    }
}

public record UpdateMeRequest(string? DisplayName, Guid? DefaultPersonaId, bool ClearDefaultPersona = false);
