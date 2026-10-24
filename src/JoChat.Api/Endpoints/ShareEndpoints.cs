using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using JoChat.Core.Abstractions;
using JoChat.Core.Constants;
using JoChat.Core.Entities;
using JoChat.Core.Enums;
using JoChat.Core.Models;
using JoChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JoChat.Api.Endpoints;

public static class ShareEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    /// <summary>Owner-side management, under the authenticated /api group.</summary>
    public static RouteGroupBuilder MapChatShareEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/chats/{id:guid}/share", async (Guid id, AppDbContext db, ICurrentUserService current, CancellationToken ct) =>
        {
            var user = await current.GetRequiredUserAsync(ct);
            var share = await db.ChatShares.FirstOrDefaultAsync(s => s.ChatId == id && s.Chat!.OwnerId == user.Id, ct);
            return share is null ? Results.NoContent() : Results.Ok(ToOwnerDto(share));
        });

        // Create or update; the token is kept on update so an existing link keeps working.
        group.MapPut("/chats/{id:guid}/share", async (Guid id, ShareRequest req, AppDbContext db,
            ICurrentUserService current, CancellationToken ct) =>
        {
            var user = await current.GetRequiredUserAsync(ct);
            var owned = await db.Chats.AnyAsync(c => c.Id == id && c.OwnerId == user.Id, ct);
            if (!owned) return Results.NotFound();

            var share = await db.ChatShares.FirstOrDefaultAsync(s => s.ChatId == id, ct);
            if (share is null)
            {
                share = new ChatShare
                {
                    Id = Guid.NewGuid(), ChatId = id, Token = NewToken(),
                    AllowAnonymous = req.AllowAnonymous, CreatedAt = DateTime.UtcNow,
                };
                db.ChatShares.Add(share);
            }
            else
            {
                share.AllowAnonymous = req.AllowAnonymous;
            }
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToOwnerDto(share));
        });

        group.MapDelete("/chats/{id:guid}/share", async (Guid id, AppDbContext db, ICurrentUserService current, CancellationToken ct) =>
        {
            var user = await current.GetRequiredUserAsync(ct);
            var share = await db.ChatShares.FirstOrDefaultAsync(s => s.ChatId == id && s.Chat!.OwnerId == user.Id, ct);
            if (share is null) return Results.NotFound();
            db.ChatShares.Remove(share);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });
        return group;
    }

    /// <summary>
    /// Viewer side. Mapped outside the authenticated group: anonymous shares need no account,
    /// members-only shares check the caller's role, and cloning always requires a user.
    /// </summary>
    public static IEndpointRouteBuilder MapPublicShareEndpoints(this IEndpointRouteBuilder app)
    {
        // AllowAnonymous goes on the two viewer endpoints individually: on the group it would also
        // override the clone endpoint's RequireAuthorization (anonymous metadata wins).
        var group = app.MapGroup("/api/shares");

        group.MapGet("/{token}", async (string token, ClaimsPrincipal principal, AppDbContext db, CancellationToken ct) =>
        {
            var share = await db.ChatShares
                .Include(s => s.Chat!).ThenInclude(c => c.Persona)
                .Include(s => s.Chat!).ThenInclude(c => c.Owner)
                .FirstOrDefaultAsync(s => s.Token == token, ct);
            if (share is null) return Results.NotFound();
            if (!CanView(share, principal)) return Results.Unauthorized();

            var chat = share.Chat!;
            var messages = await db.Messages
                .Where(m => m.ChatId == chat.Id)
                .OrderBy(m => m.CreatedAt)
                .Select(m => new
                {
                    m.Id, Role = m.Role.ToString(), m.Content, m.CreatedAt, m.ToolActivity,
                    Attachments = m.Attachments
                        .Where(a => a.Kind != AttachmentKind.TtsAudio)
                        .Select(a => new { a.Id, Kind = a.Kind.ToString(), a.MimeType, a.FileName, a.SizeBytes, a.Width, a.Height })
                        .ToList(),
                })
                .ToListAsync(ct);

            return Results.Ok(new
            {
                chat.Title,
                share.AllowAnonymous,
                OwnerName = chat.Owner?.DisplayName,
                // Name/model only — the system prompt stays private.
                Persona = chat.Persona is null ? null : new { chat.Persona.Name, chat.Persona.Description, chat.Persona.ModelId },
                Messages = messages.Select(m => new
                {
                    m.Id, m.Role, m.Content, m.CreatedAt, m.Attachments,
                    ToolActivity = m.ToolActivity is null ? null : JsonSerializer.Deserialize<List<ToolStep>>(m.ToolActivity, JsonOptions),
                }),
            });
        }).AllowAnonymous();

        group.MapGet("/{token}/attachments/{attachmentId:guid}", async (string token, Guid attachmentId,
            ClaimsPrincipal principal, AppDbContext db, IFileStorage storage, CancellationToken ct) =>
        {
            var share = await db.ChatShares.FirstOrDefaultAsync(s => s.Token == token, ct);
            if (share is null) return Results.NotFound();
            if (!CanView(share, principal)) return Results.Unauthorized();

            var attachment = await db.Attachments
                .FirstOrDefaultAsync(a => a.Id == attachmentId && a.Message!.ChatId == share.ChatId && a.Kind != AttachmentKind.TtsAudio, ct);
            if (attachment is null) return Results.NotFound();
            var stream = await storage.OpenReadAsync(attachment.StoragePath, ct);
            return attachment.Kind == AttachmentKind.GeneratedFile
                ? Results.File(stream, attachment.MimeType, fileDownloadName: attachment.FileName ?? "file")
                : Results.File(stream, attachment.MimeType, enableRangeProcessing: true);
        }).AllowAnonymous();

        // Copy the conversation into a chat of the caller's own. The original persona is reused
        // when the caller may use it; otherwise they must name one of theirs (409 tells the UI).
        group.MapPost("/{token}/clone", async (string token, CloneRequest? req, AppDbContext db,
            ICurrentUserService current, IFileStorage storage, CancellationToken ct) =>
        {
            var user = await current.GetRequiredUserAsync(ct);
            var share = await db.ChatShares.Include(s => s.Chat!).ThenInclude(c => c.Persona)
                .FirstOrDefaultAsync(s => s.Token == token, ct);
            if (share is null) return Results.NotFound();
            var source = share.Chat!;

            Persona? persona = null;
            if (req?.PersonaId is { } chosen)
                persona = await db.Personas.FirstOrDefaultAsync(p => p.Id == chosen && (p.OwnerId == user.Id || p.IsShared), ct);
            else if (source.Persona is { } original && (original.OwnerId == user.Id || original.IsShared))
                persona = original;
            if (persona is null)
                return Results.Problem("The chat's persona isn't available to you; choose one of your own.",
                    statusCode: StatusCodes.Status409Conflict);

            var messages = await db.Messages.Include(m => m.Attachments)
                .Where(m => m.ChatId == source.Id).OrderBy(m => m.CreatedAt).ToListAsync(ct);

            var now = DateTime.UtcNow;
            var chat = new Chat
            {
                Id = Guid.NewGuid(), Title = $"Copy of {source.Title}", PersonaId = persona.Id,
                OwnerId = user.Id, CreatedAt = now, UpdatedAt = now,
            };
            db.Chats.Add(chat);

            var idMap = new Dictionary<Guid, Guid>();
            foreach (var m in messages)
            {
                var copy = new Message
                {
                    Id = Guid.NewGuid(), ChatId = chat.Id, Role = m.Role, Content = m.Content,
                    TokensIn = m.TokensIn, TokensOut = m.TokensOut, ToolActivity = m.ToolActivity,
                    ProviderContent = m.ProviderContent, ProviderContentFormat = m.ProviderContentFormat,
                    CreatedAt = m.CreatedAt, // keep the original ordering
                    ParentMessageId = m.ParentMessageId is { } pid && idMap.TryGetValue(pid, out var mapped) ? mapped : null,
                };
                idMap[m.Id] = copy.Id;
                db.Messages.Add(copy);

                // Files are copied so the clone survives the original being deleted.
                foreach (var a in m.Attachments.Where(a => a.Kind != AttachmentKind.TtsAudio))
                {
                    await using var src = await storage.OpenReadAsync(a.StoragePath, ct);
                    var path = await storage.SaveAsync(src, a.MimeType, ct);
                    db.Attachments.Add(new Attachment
                    {
                        Id = Guid.NewGuid(), MessageId = copy.Id, OwnerId = user.Id, Kind = a.Kind,
                        StoragePath = path, MimeType = a.MimeType, FileName = a.FileName, SizeBytes = a.SizeBytes,
                        Width = a.Width, Height = a.Height, CreatedAt = now,
                    });
                }
            }
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/chats/{chat.Id}", new { chat.Id });
        }).RequireAuthorization(Policies.User);

        return app;
    }

    private static bool CanView(ChatShare share, ClaimsPrincipal principal) =>
        share.AllowAnonymous || principal.IsInRole(JoChatRoles.User) || principal.IsInRole(JoChatRoles.SuperAdmin);

    private static string NewToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(24)).Replace('+', '-').Replace('/', '_').TrimEnd('=');

    private static object ToOwnerDto(ChatShare s) => new { s.Token, s.AllowAnonymous, s.CreatedAt };
}

public record ShareRequest(bool AllowAnonymous);
public record CloneRequest(Guid? PersonaId);
