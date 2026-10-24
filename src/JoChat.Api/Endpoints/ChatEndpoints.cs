using System.Net.ServerSentEvents;
using JoChat.Api.Services;
using JoChat.Core.Models;
using JoChat.Core.Abstractions;
using JoChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JoChat.Api.Endpoints;

public static class ChatEndpoints
{
    public static RouteGroupBuilder MapChatEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/chats", async (AppDbContext db, ICurrentUserService current, CancellationToken ct) =>
        {
            var user = await current.GetRequiredUserAsync(ct);
            return await db.Chats.Where(c => c.OwnerId == user.Id)
                .OrderByDescending(c => c.UpdatedAt)
                .Select(c => new { c.Id, c.Title, c.PersonaId, c.UpdatedAt })
                .ToListAsync(ct);
        });

        group.MapPost("/chats", async (CreateChatRequest req, AppDbContext db,
            ICurrentUserService current, CancellationToken ct) =>
        {
            var user = await current.GetRequiredUserAsync(ct);
            var personaUsable = await db.Personas
                .AnyAsync(p => p.Id == req.PersonaId && (p.OwnerId == user.Id || p.IsShared), ct);
            if (!personaUsable)
                return Results.Problem("Persona not found.", statusCode: StatusCodes.Status400BadRequest);

            var chat = new Core.Entities.Chat
            {
                Id = Guid.NewGuid(), Title = req.Title ?? ChatTitles.Default,
                PersonaId = req.PersonaId, OwnerId = user.Id,
                CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
            };
            db.Chats.Add(chat);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/chats/{chat.Id}", new { chat.Id });
        });

        // Ownership checks below return 404 for both missing and foreign chats so that
        // chat ids can't be probed for existence.
        group.MapGet("/chats/{id:guid}/messages", async (Guid id, AppDbContext db,
            ICurrentUserService current, CancellationToken ct) =>
        {
            var user = await current.GetRequiredUserAsync(ct);
            var owned = await db.Chats.AnyAsync(c => c.Id == id && c.OwnerId == user.Id, ct);
            if (!owned) return Results.NotFound();

            var messages = await db.Messages
                .Where(m => m.ChatId == id)
                .OrderBy(m => m.CreatedAt)
                .Select(m => new
                {
                    m.Id, m.ParentMessageId, Role = m.Role.ToString(), m.Content,
                    m.TokensIn, m.TokensOut, m.CreatedAt,
                    Attachments = m.Attachments.Select(a => new
                    {
                        a.Id, Kind = a.Kind.ToString(), a.MimeType, a.Width, a.Height,
                    }).ToList(),
                })
                .ToListAsync(ct);
            return Results.Ok(messages);
        });

        // The core loop: post a user message, stream the assistant reply via SSE.
        // Each event is named after its kind (text/completed/error) so clients can
        // switch on `event:` instead of sniffing the JSON shape.
        group.MapPost("/chats/{id:guid}/messages",
            (Guid id, SendMessageRequest req, IChatStreamingService chatService, CancellationToken ct)
                => TypedResults.ServerSentEvents(
                    chatService.SendAndStreamAsync(id, req.Text, req.AttachmentIds, ct)
                        .Select(e => new SseItem<ChatStreamEvent>(e, SseEventName(e)))))
            .RequireRateLimiting(RatePolicies.Chat);

        group.MapDelete("/chats/{id:guid}", async (Guid id, AppDbContext db,
            ICurrentUserService current, IFileStorage storage, CancellationToken ct) =>
        {
            var user = await current.GetRequiredUserAsync(ct);
            var chat = await db.Chats.FirstOrDefaultAsync(c => c.Id == id && c.OwnerId == user.Id, ct);
            if (chat is null) return Results.NotFound();

            // Messages cascade, but attachments only get their FK nulled — remove them explicitly
            // along with their files so nothing is left orphaned on disk.
            var attachments = await db.Attachments
                .Where(a => a.Message!.ChatId == id)
                .ToListAsync(ct);
            foreach (var a in attachments)
                await storage.DeleteAsync(a.StoragePath, ct);
            db.Attachments.RemoveRange(attachments);
            db.Chats.Remove(chat);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });
        return group;
    }

    private static string SseEventName(ChatStreamEvent e) => e switch
    {
        ChatStreamEvent.TextDelta => "text",
        ChatStreamEvent.Completed => "completed",
        ChatStreamEvent.Error => "error",
        _ => "message",
    };
}

public record CreateChatRequest(Guid PersonaId, string? Title);
public record SendMessageRequest(string Text, List<Guid>? AttachmentIds);
