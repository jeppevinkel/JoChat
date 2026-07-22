using JoChat.Api.Services;
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
            // TODO: validate persona exists + ownership/IsShared
            var chat = new Core.Entities.Chat
            {
                Id = Guid.NewGuid(), Title = req.Title ?? "New chat",
                PersonaId = req.PersonaId, OwnerId = user.Id,
                CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
            };
            db.Chats.Add(chat);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/chats/{chat.Id}", new { chat.Id });
        });

        group.MapGet("/chats/{id:guid}/messages",
            // TODO:
            // 1. Load chat, verify ownership (404/403 if not owner).
            // 2. Return ordered Messages (+ attachment refs) for the chat.
            () => Results.Ok());

        // The core loop: post a user message, stream the assistant reply via SSE.
        group.MapPost("/chats/{id:guid}/messages",
            (Guid id, SendMessageRequest req, IChatStreamingService chatService, CancellationToken ct)
                => TypedResults.ServerSentEvents(
                    chatService.SendAndStreamAsync(id, req.Text, req.AttachmentIds, ct),
                    eventType: "message"));

        group.MapDelete("/chats/{id:guid}",
            // TODO:
            // 1. Load chat, verify ownership (404/403 if not owner).
            // 2. Delete chat + cascade Messages/attachment links (and orphaned UsageRecords?).
            () => Results.NoContent());
        return group;
    }
}

public record CreateChatRequest(Guid PersonaId, string? Title);
public record SendMessageRequest(string Text, List<Guid>? AttachmentIds);