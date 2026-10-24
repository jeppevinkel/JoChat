using System.Text.Json;
using System.Text.RegularExpressions;
using JoChat.Core.Abstractions;
using JoChat.Core.Entities;
using JoChat.Core.Enums;
using JoChat.Core.Models;
using JoChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JoChat.Api.Endpoints;

/// <summary>
/// Moderation views for super admins: every persona and chat regardless of owner, transcripts and
/// a text search over messages. Looking at content (a transcript or a search) is written to the
/// admin audit log, which is listed here too.
/// </summary>
public static class AdminOversightEndpoints
{
    private const int ChatPageSize = 50;
    private const int AuditPageSize = 100;
    // Re-opening the same transcript or repeating a search within this window isn't logged again
    // (reloads, paging back and forth), so the trail stays readable.
    private static readonly TimeSpan AuditDedupeWindow = TimeSpan.FromMinutes(1);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static RouteGroupBuilder MapAdminOversightEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/personas", async (Guid? userId, AppDbContext db, CancellationToken ct) =>
            await db.Personas
                .Where(p => userId == null || p.OwnerId == userId)
                .OrderByDescending(p => p.UpdatedAt)
                .Select(p => new
                {
                    p.Id, p.OwnerId, p.Name, p.Description, p.SystemPrompt, p.Provider, p.ModelId, p.MaxTokens,
                    p.EnableWebSearch, p.EnableWebFetch, p.EnableCodeExecution, p.IsShared, p.UpdatedAt,
                    Chats = db.Chats.Count(c => c.PersonaId == p.Id),
                })
                .ToListAsync(ct));

        group.MapGet("/chats", async (Guid? userId, string? q, DateTime? from, DateTime? to, int? page,
            AppDbContext db, ICurrentUserService current, CancellationToken ct) =>
        {
            var query = db.Chats.AsQueryable();
            if (userId is { } owner) query = query.Where(c => c.OwnerId == owner);
            // Query-string dates parse as Unspecified; timestamptz parameters must be UTC. `to` is exclusive.
            if (from is { } start) query = query.Where(c => c.UpdatedAt >= DateTime.SpecifyKind(start, DateTimeKind.Utc));
            if (to is { } end) query = query.Where(c => c.UpdatedAt < DateTime.SpecifyKind(end, DateTimeKind.Utc));

            var search = q?.Trim();
            string? pattern = null;
            if (!string.IsNullOrEmpty(search))
            {
                pattern = $"%{EscapeLike(search)}%";
                query = query.Where(c => c.Messages.Any(m => EF.Functions.ILike(m.Content, pattern, LikeEscape)));
                var admin = await current.GetRequiredUserAsync(ct);
                await RecordAsync(db, admin.Id, AdminAuditActions.SearchMessages, userId, null, search, ct);
            }

            var pageNumber = Math.Max(1, page ?? 1);
            var total = await query.CountAsync(ct);
            var chats = await query
                .OrderByDescending(c => c.UpdatedAt)
                .Skip((pageNumber - 1) * ChatPageSize)
                .Take(ChatPageSize)
                .Select(c => new
                {
                    c.Id, c.Title, c.OwnerId, c.CreatedAt, c.UpdatedAt,
                    PersonaName = c.Persona!.Name, PersonaModelId = c.Persona.ModelId,
                    Messages = c.Messages.Count,
                    IsShared = db.ChatShares.Any(s => s.ChatId == c.Id),
                    // The earliest matching message, cut down to a snippet below.
                    Match = pattern == null
                        ? null
                        : c.Messages.Where(m => EF.Functions.ILike(m.Content, pattern, LikeEscape))
                            .OrderBy(m => m.CreatedAt).Select(m => m.Content).FirstOrDefault(),
                })
                .ToListAsync(ct);

            return Results.Ok(new
            {
                Total = total, Page = pageNumber, PageSize = ChatPageSize,
                Items = chats.Select(c => new
                {
                    c.Id, c.Title, c.OwnerId, c.CreatedAt, c.UpdatedAt, c.PersonaName, c.PersonaModelId,
                    c.Messages, c.IsShared,
                    Snippet = c.Match is null || search is null ? null : Snippet(c.Match, search),
                }),
            });
        });

        group.MapGet("/chats/{id:guid}", async (Guid id, AppDbContext db, ICurrentUserService current,
            CancellationToken ct) =>
        {
            var chat = await db.Chats.Include(c => c.Persona).FirstOrDefaultAsync(c => c.Id == id, ct);
            if (chat is null) return Results.NotFound();

            var admin = await current.GetRequiredUserAsync(ct);
            await RecordAsync(db, admin.Id, AdminAuditActions.ViewChat, chat.OwnerId, chat.Id, chat.Title, ct);

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
                chat.Id, chat.Title, chat.OwnerId, chat.CreatedAt, chat.UpdatedAt,
                IsShared = await db.ChatShares.AnyAsync(s => s.ChatId == chat.Id, ct),
                // Unlike a share link, moderation sees the system prompt: it shapes what was said.
                Persona = chat.Persona is null
                    ? null
                    : new { chat.Persona.Id, chat.Persona.Name, chat.Persona.Description, chat.Persona.ModelId, chat.Persona.SystemPrompt },
                Messages = messages.Select(m => new
                {
                    m.Id, m.Role, m.Content, m.CreatedAt, m.Attachments,
                    ToolActivity = m.ToolActivity is null ? null : JsonSerializer.Deserialize<List<ToolStep>>(m.ToolActivity, JsonOptions),
                }),
            });
        });

        // Images and files inside chats, for the transcript view. Opening the transcript is what's
        // audited; its attachments load as part of it.
        group.MapGet("/attachments/{id:guid}", async (Guid id, AppDbContext db, IFileStorage storage,
            CancellationToken ct) =>
        {
            var attachment = await db.Attachments
                .FirstOrDefaultAsync(a => a.Id == id && a.MessageId != null && a.Kind != AttachmentKind.TtsAudio, ct);
            if (attachment is null) return Results.NotFound();
            var stream = await storage.OpenReadAsync(attachment.StoragePath, ct);
            return attachment.Kind == AttachmentKind.GeneratedFile
                ? Results.File(stream, attachment.MimeType, fileDownloadName: attachment.FileName ?? "file")
                : Results.File(stream, attachment.MimeType, enableRangeProcessing: true);
        });

        group.MapGet("/audit", async (int? page, AppDbContext db, CancellationToken ct) =>
        {
            var pageNumber = Math.Max(1, page ?? 1);
            var total = await db.AdminAuditEntries.CountAsync(ct);
            var items = await db.AdminAuditEntries
                .OrderByDescending(a => a.CreatedAt)
                .Skip((pageNumber - 1) * AuditPageSize)
                .Take(AuditPageSize)
                .Select(a => new
                {
                    a.Id, a.AdminId, a.Action, a.TargetUserId, a.ChatId, a.Detail, a.CreatedAt,
                    ChatExists = a.ChatId != null && db.Chats.Any(c => c.Id == a.ChatId),
                })
                .ToListAsync(ct);
            return Results.Ok(new { Total = total, Page = pageNumber, PageSize = AuditPageSize, Items = items });
        });

        return group;
    }

    private static async Task RecordAsync(AppDbContext db, Guid adminId, string action, Guid? targetUserId,
        Guid? chatId, string? detail, CancellationToken ct)
    {
        var since = DateTime.UtcNow - AuditDedupeWindow;
        var repeated = await db.AdminAuditEntries.AnyAsync(a =>
            a.AdminId == adminId && a.Action == action && a.TargetUserId == targetUserId &&
            a.ChatId == chatId && a.Detail == detail && a.CreatedAt > since, ct);
        if (repeated) return;

        db.AdminAuditEntries.Add(new AdminAuditEntry
        {
            Id = Guid.NewGuid(), AdminId = adminId, Action = action, TargetUserId = targetUserId,
            ChatId = chatId, Detail = detail, CreatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync(ct);
    }

    // ILIKE treats % and _ as wildcards; a search is for the literal text, so they're escaped. The
    // escape character has to be passed explicitly: without one, Npgsql emits ESCAPE '' (escaping
    // off), and the backslashes would be searched for literally.
    private const string LikeEscape = @"\";

    private static string EscapeLike(string text) =>
        text.Replace(LikeEscape, LikeEscape + LikeEscape).Replace("%", LikeEscape + "%").Replace("_", LikeEscape + "_");

    /// <summary>A one-line excerpt around the first case-insensitive occurrence of <paramref name="term"/>.</summary>
    private static string Snippet(string content, string term, int context = 70)
    {
        var flat = Regex.Replace(content, @"\s+", " ").Trim();
        var index = flat.IndexOf(term, StringComparison.OrdinalIgnoreCase);
        if (index < 0) return flat.Length <= context * 2 ? flat : flat[..(context * 2)] + "…";
        var start = Math.Max(0, index - context);
        var end = Math.Min(flat.Length, index + term.Length + context);
        return (start > 0 ? "…" : "") + flat[start..end] + (end < flat.Length ? "…" : "");
    }
}
