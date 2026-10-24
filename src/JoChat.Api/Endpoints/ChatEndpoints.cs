using System.Net.ServerSentEvents;
using System.Text.Json;
using JoChat.Api.Services;
using JoChat.Core.Models;
using JoChat.Core.Abstractions;
using JoChat.Core.Enums;
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
                    m.TokensIn, m.TokensOut, m.CreatedAt, m.ToolActivity,
                    Attachments = m.Attachments.Select(a => new
                    {
                        a.Id, Kind = a.Kind.ToString(), a.MimeType, a.Width, a.Height,
                    }).ToList(),
                })
                .ToListAsync(ct);
            // ToolActivity is stored as JSON text; hand the client structured steps.
            return Results.Ok(messages.Select(m => new
            {
                m.Id, m.ParentMessageId, m.Role, m.Content, m.TokensIn, m.TokensOut, m.CreatedAt, m.Attachments,
                ToolActivity = m.ToolActivity is null ? null : JsonSerializer.Deserialize<List<ToolStep>>(m.ToolActivity, JsonOptions),
            }));
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

        // Edit a message in place (either role). Cached read-aloud audio is dropped since the
        // text it was made from has changed.
        group.MapPut("/chats/{id:guid}/messages/{messageId:guid}", async (Guid id, Guid messageId,
            EditMessageRequest req, AppDbContext db, ICurrentUserService current, IFileStorage storage,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Content))
                return Results.Problem("Content is required.", statusCode: StatusCodes.Status400BadRequest);

            var user = await current.GetRequiredUserAsync(ct);
            var message = await db.Messages
                .Include(m => m.Attachments)
                .FirstOrDefaultAsync(m => m.Id == messageId && m.ChatId == id && m.Chat!.OwnerId == user.Id, ct);
            if (message is null) return Results.NotFound();

            message.Content = req.Content;
            var audio = message.Attachments.Where(a => a.Kind == AttachmentKind.TtsAudio).ToList();
            db.Attachments.RemoveRange(audio);
            await db.SaveChangesAsync(ct);
            foreach (var a in audio) await storage.DeleteAsync(a.StoragePath, ct);
            return Results.Ok(new { message.Id, message.Content });
        });

        group.MapDelete("/chats/{id:guid}/messages/{messageId:guid}", async (Guid id, Guid messageId,
            AppDbContext db, ICurrentUserService current, IFileStorage storage, CancellationToken ct) =>
        {
            var user = await current.GetRequiredUserAsync(ct);
            var message = await db.Messages
                .Include(m => m.Attachments)
                .FirstOrDefaultAsync(m => m.Id == messageId && m.ChatId == id && m.Chat!.OwnerId == user.Id, ct);
            if (message is null) return Results.NotFound();

            var files = message.Attachments.Select(a => a.StoragePath).ToList();
            db.Attachments.RemoveRange(message.Attachments);
            db.Messages.Remove(message);
            await db.SaveChangesAsync(ct);
            foreach (var path in files) await storage.DeleteAsync(path, ct);
            return Results.NoContent();
        });

        // Replace an assistant reply (and anything after it) with a freshly streamed one.
        group.MapPost("/chats/{id:guid}/messages/{messageId:guid}/regenerate",
            (Guid id, Guid messageId, IChatStreamingService chatService, CancellationToken ct)
                => TypedResults.ServerSentEvents(
                    chatService.RegenerateAsync(id, messageId, ct)
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

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static string SseEventName(ChatStreamEvent e) => e switch
    {
        ChatStreamEvent.TextDelta => "text",
        ChatStreamEvent.ToolUse => "tool_use",
        ChatStreamEvent.ToolResult => "tool_result",
        ChatStreamEvent.Completed => "completed",
        ChatStreamEvent.Error => "error",
        _ => "message",
    };
}

public record CreateChatRequest(Guid PersonaId, string? Title);
public record SendMessageRequest(string Text, List<Guid>? AttachmentIds);
public record EditMessageRequest(string Content);
