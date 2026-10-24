using JoChat.Core.Entities;
using JoChat.Core.Enums;
using JoChat.Core.Options;
using JoChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace JoChat.Api.Endpoints;

public static class AdminEndpoints
{
    public static RouteGroupBuilder MapAdminEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/models", async (AppDbContext db, CancellationToken ct) =>
            await db.ModelDefinitions.OrderBy(m => m.Provider).ThenBy(m => m.DisplayName).ToListAsync(ct));

        group.MapPost("/models", async (ModelDefinitionRequest req, AppDbContext db, CancellationToken ct) =>
        {
            if (await db.ModelDefinitions.AnyAsync(m => m.Provider == req.Provider && m.ModelId == req.ModelId, ct))
                return Results.Problem("Model already exists.", statusCode: StatusCodes.Status409Conflict);

            var model = new ModelDefinition
            {
                Id = Guid.NewGuid(),
                Provider = req.Provider,
                ModelId = req.ModelId,
                DisplayName = req.DisplayName,
                SupportsVision = req.SupportsVision,
                IsEnabled = req.IsEnabled,
            };
            db.ModelDefinitions.Add(model);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/admin/models/{model.Id}", model);
        });

        group.MapPut("/models/{id:guid}", async (Guid id, ModelDefinitionRequest req, AppDbContext db,
            CancellationToken ct) =>
        {
            var model = await db.ModelDefinitions.FindAsync([id], ct);
            if (model is null) return Results.NotFound();

            model.Provider = req.Provider;
            model.ModelId = req.ModelId;
            model.DisplayName = req.DisplayName;
            model.SupportsVision = req.SupportsVision;
            model.IsEnabled = req.IsEnabled;
            await db.SaveChangesAsync(ct);
            return Results.Ok(model);
        });

        group.MapDelete("/models/{id:guid}", async (Guid id, AppDbContext db, CancellationToken ct) =>
        {
            var model = await db.ModelDefinitions.FindAsync([id], ct);
            if (model is null) return Results.NotFound();

            // Personas reference models by (Provider, ModelId) string pair, not FK — disable instead
            // of deleting if any persona still points at it, so existing chats keep working.
            if (await db.Personas.AnyAsync(p => p.Provider == model.Provider && p.ModelId == model.ModelId, ct))
                return Results.Problem("Model is referenced by personas; disable it instead.",
                    statusCode: StatusCodes.Status409Conflict);

            db.ModelDefinitions.Remove(model);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        group.MapGet("/usage", async (DateTime? from, DateTime? to, AppDbContext db, CancellationToken ct) =>
        {
            // Query-string dates parse as Unspecified; timestamptz parameters must be UTC.
            var start = DateTime.SpecifyKind(from ?? DateTime.UtcNow.AddDays(-30), DateTimeKind.Utc);
            var end = DateTime.SpecifyKind(to ?? DateTime.UtcNow, DateTimeKind.Utc);
            var rows = await db.UsageRecords
                .Where(u => u.CreatedAt >= start && u.CreatedAt < end)
                .GroupBy(u => new { u.UserId, u.Provider, u.ModelOrVoiceId, u.Kind })
                .Select(g => new
                {
                    g.Key.UserId, g.Key.Provider, g.Key.ModelOrVoiceId, g.Key.Kind,
                    Requests = g.Count(),
                    TokensIn = g.Sum(u => u.TokensIn ?? 0),
                    TokensOut = g.Sum(u => u.TokensOut ?? 0),
                    Units = g.Sum(u => u.Units ?? 0),
                })
                .ToListAsync(ct);
            return Results.Ok(new { From = start, To = end, Rows = rows });
        });

        group.MapGet("/users", async (AppDbContext db, IOptions<AuthorizationGroupOptions> groups, CancellationToken ct) =>
        {
            var userGroup = groups.Value.UserGroup;
            var adminGroup = groups.Value.SuperAdminGroup;
            // Left join so SCIM-provisioned users who haven't logged in yet (no profile) still show;
            // role flags come from SCIM group membership, the same source the claims transformation uses.
            var users = await db.ScimUsers
                .GroupJoin(db.UserProfiles, s => s.Id, p => p.ScimUserId, (s, profiles) => new { s, profiles })
                .SelectMany(x => x.profiles.DefaultIfEmpty(), (x, p) => new
                {
                    ScimUserId = x.s.Id,
                    x.s.ExternalId,
                    x.s.UserName,
                    x.s.Active,
                    ProfileId = p != null ? p.Id : (Guid?)null,
                    DisplayName = p != null ? p.DisplayName : null,
                    FirstSeen = p != null ? p.CreatedAt : (DateTime?)null,
                    LastSeen = p != null ? p.LastSeenAt : null,
                    HasAccess = db.ScimGroups.Any(g => g.DisplayName == userGroup && g.Members.Any(m => m.Value == x.s.Id)),
                    IsAdmin = db.ScimGroups.Any(g => g.DisplayName == adminGroup && g.Members.Any(m => m.Value == x.s.Id)),
                    // Activity at a glance; zero/null for people who never signed in.
                    Chats = p != null ? db.Chats.Count(c => c.OwnerId == p.Id) : 0,
                    MessagesSent = p != null ? db.Messages.Count(m => m.Chat!.OwnerId == p.Id && m.Role == MessageRole.User) : 0,
                    Personas = p != null ? db.Personas.Count(q => q.OwnerId == p.Id) : 0,
                    LastChatAt = p != null ? db.Chats.Where(c => c.OwnerId == p.Id).Max(c => (DateTime?)c.UpdatedAt) : null,
                })
                .OrderBy(u => u.UserName)
                .ToListAsync(ct);
            return Results.Ok(users);
        });
        return group;
    }
}

public record ModelDefinitionRequest(
    string Provider, string ModelId, string DisplayName, bool SupportsVision, bool IsEnabled = true);
