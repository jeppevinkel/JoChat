using System.Runtime.CompilerServices;
using System.Text.Json;
using JoChat.Core.Abstractions;
using JoChat.Core.Entities;
using JoChat.Core.Enums;
using JoChat.Core.Models;
using JoChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JoChat.Api.Services;

public interface IChatStreamingService
{
    /// <summary>Persists a user message and streams the assistant reply.</summary>
    IAsyncEnumerable<ChatStreamEvent> SendAndStreamAsync(
        Guid chatId, string text, List<Guid>? attachmentIds, CancellationToken ct);

    /// <summary>Discards an assistant message and everything after it, then streams a new reply in its place.</summary>
    IAsyncEnumerable<ChatStreamEvent> RegenerateAsync(Guid chatId, Guid messageId, CancellationToken ct);
}

public class ChatStreamingService(
    AppDbContext db,
    ICurrentUserService current,
    IFileStorage storage,
    IServiceProvider services,
    ILogger<ChatStreamingService> logger) : IChatStreamingService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async IAsyncEnumerable<ChatStreamEvent> SendAndStreamAsync(
        Guid chatId, string text, List<Guid>? attachmentIds,
        [EnumeratorCancellation] CancellationToken ct)
    {
        var user = await current.GetRequiredUserAsync(ct);

        // The SSE response has already started by the time we run, so failures are
        // reported as Error events rather than HTTP status codes.
        var chat = await LoadChatAsync(chatId, user, ct);
        if (chat?.Persona is null)
        {
            yield return new ChatStreamEvent.Error("Chat not found.");
            yield break;
        }

        var provider = services.GetKeyedService<IChatCompletionProvider>(chat.Persona.Provider);
        if (provider is null)
        {
            yield return new ChatStreamEvent.Error($"Unknown chat provider '{chat.Persona.Provider}'.");
            yield break;
        }

        // Only the caller's own, not-yet-attached uploads may be linked to the new message.
        var attachments = attachmentIds is { Count: > 0 }
            ? await db.Attachments
                .Where(a => attachmentIds.Contains(a.Id) && a.OwnerId == user.Id && a.MessageId == null)
                .ToListAsync(ct)
            : [];

        var userMessage = new Message
        {
            Id = Guid.NewGuid(),
            ChatId = chat.Id,
            Role = MessageRole.User,
            Content = text,
            CreatedAt = DateTime.UtcNow,
            Attachments = attachments,
        };
        // Added through the DbSet (an entity discovered only via navigation with a pre-set key is
        // tracked as Modified, skipping the INSERT). EF's fix-up appends it to chat.Messages as well,
        // so adding it to the collection too would duplicate it in the history sent to the model.
        db.Messages.Add(userMessage);
        if (chat.Title == ChatTitles.Default)
            chat.Title = ChatTitles.Derive(text);
        chat.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        await foreach (var evt in StreamReplyAsync(chat, provider, user, userMessage, ct))
            yield return evt;
    }

    public async IAsyncEnumerable<ChatStreamEvent> RegenerateAsync(
        Guid chatId, Guid messageId, [EnumeratorCancellation] CancellationToken ct)
    {
        var user = await current.GetRequiredUserAsync(ct);
        var chat = await LoadChatAsync(chatId, user, ct);
        var target = chat?.Messages.FirstOrDefault(m => m.Id == messageId);
        if (chat?.Persona is null || target is null || target.Role != MessageRole.Assistant)
        {
            yield return new ChatStreamEvent.Error("Message not found.");
            yield break;
        }

        var provider = services.GetKeyedService<IChatCompletionProvider>(chat.Persona.Provider);
        if (provider is null)
        {
            yield return new ChatStreamEvent.Error($"Unknown chat provider '{chat.Persona.Provider}'.");
            yield break;
        }

        // Everything from the target onwards is replaced; later turns would no longer make sense.
        var removed = chat.Messages.Where(m => m.CreatedAt >= target.CreatedAt || m.Id == target.Id).ToList();
        var files = removed.SelectMany(m => m.Attachments).Select(a => a.StoragePath).ToList();
        db.Attachments.RemoveRange(removed.SelectMany(m => m.Attachments));
        db.Messages.RemoveRange(removed);
        foreach (var m in removed) chat.Messages.Remove(m);
        await db.SaveChangesAsync(ct);
        foreach (var path in files)
            await storage.DeleteAsync(path, ct);

        var parent = chat.Messages.LastOrDefault(m => m.Role == MessageRole.User);
        await foreach (var evt in StreamReplyAsync(chat, provider, user, parent, ct))
            yield return evt;
    }

    private Task<Chat?> LoadChatAsync(Guid chatId, UserProfile user, CancellationToken ct) =>
        db.Chats
            .Include(c => c.Persona)
            .Include(c => c.Messages.OrderBy(m => m.CreatedAt))
                .ThenInclude(m => m.Attachments)
            .AsSplitQuery() // two collection includes; avoids a cartesian product over attachments
            .FirstOrDefaultAsync(c => c.Id == chatId && c.OwnerId == user.Id, ct);

    /// <summary>Streams a reply to the chat's current history and persists it (even partially) when done.</summary>
    private async IAsyncEnumerable<ChatStreamEvent> StreamReplyAsync(
        Chat chat, IChatCompletionProvider provider, UserProfile user, Message? parent,
        [EnumeratorCancellation] CancellationToken ct)
    {
        var persona = chat.Persona!;
        var history = await ChatHistory.BuildAsync(chat.Messages, storage, ct);
        var request = new ChatRequest(
            persona.ModelId, persona.SystemPrompt, history, persona.Temperature, persona.MaxTokens,
            EnabledTools(persona));

        var reply = new System.Text.StringBuilder();
        var steps = new List<ToolStep>();
        var files = new List<ChatStreamEvent.File>();
        ChatStreamEvent.Completed? completed = null;
        try
        {
            await foreach (var evt in provider.StreamCompletionAsync(request, ct))
            {
                switch (evt)
                {
                    case ChatStreamEvent.TextDelta delta:
                        reply.Append(delta.Text);
                        break;
                    case ChatStreamEvent.ToolUse use:
                        steps.Add(new ToolStep(ToolStep.Use, use.Tool, use.Label));
                        break;
                    case ChatStreamEvent.ToolResult result:
                        steps.Add(new ToolStep(ToolStep.Result, result.Tool, result.Label, result.IsError));
                        break;
                    case ChatStreamEvent.File file:
                        files.Add(file);
                        continue; // bytes stay server-side; the client sees the attachment after reload
                    case ChatStreamEvent.Completed done:
                        completed = done;
                        break;
                }
                yield return evt;
            }
        }
        finally
        {
            // Persist whatever the model produced even if the client disconnected mid-stream,
            // so the conversation history stays consistent with what was billed.
            if (completed is not null || reply.Length > 0 || steps.Count > 0)
                await PersistReplyAsync(chat, user, persona, parent, reply.ToString(), steps, files, completed);
        }
    }

    private static List<string>? EnabledTools(Persona persona)
    {
        List<string>? tools = null;
        if (persona.EnableWebSearch) (tools ??= []).Add(ChatTools.WebSearch);
        if (persona.EnableWebFetch) (tools ??= []).Add(ChatTools.WebFetch);
        if (persona.EnableCodeExecution) (tools ??= []).Add(ChatTools.CodeExecution);
        return tools;
    }

    private async Task PersistReplyAsync(
        Chat chat, UserProfile user, Persona persona, Message? parent,
        string content, List<ToolStep> steps, List<ChatStreamEvent.File> files, ChatStreamEvent.Completed? completed)
    {
        var message = new Message
        {
            Id = Guid.NewGuid(),
            ChatId = chat.Id,
            ParentMessageId = parent?.Id,
            Role = MessageRole.Assistant,
            Content = content,
            TokensIn = completed?.TokensIn,
            TokensOut = completed?.TokensOut,
            ToolActivity = steps.Count == 0 ? null : JsonSerializer.Serialize(steps, JsonOptions),
            ProviderContent = completed?.RawContent,
            ProviderContentFormat = completed?.RawContent is null ? null : completed.RawContentFormat,
            CreatedAt = DateTime.UtcNow,
        };
        db.Messages.Add(message);

        foreach (var file in files)
        {
            try
            {
                await using var ms = new MemoryStream(file.Data.ToArray());
                var path = await storage.SaveAsync(ms, file.MimeType, CancellationToken.None);
                var isImage = file.MimeType.StartsWith("image/", StringComparison.OrdinalIgnoreCase);
                db.Attachments.Add(new Attachment
                {
                    Id = Guid.NewGuid(),
                    MessageId = message.Id,
                    OwnerId = user.Id,
                    // Images the sandbox produced display inline (and get shown back to the model).
                    Kind = isImage ? AttachmentKind.GeneratedImage : AttachmentKind.GeneratedFile,
                    StoragePath = path,
                    MimeType = file.MimeType,
                    FileName = file.FileName,
                    SizeBytes = file.Data.Length,
                    CreatedAt = DateTime.UtcNow,
                });
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to store produced file {FileName}", file.FileName);
            }
        }
        if (completed is not null)
        {
            db.UsageRecords.Add(new UsageRecord
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                Provider = persona.Provider,
                ModelOrVoiceId = persona.ModelId,
                Kind = "chat",
                TokensIn = completed.TokensIn,
                TokensOut = completed.TokensOut,
                CreatedAt = DateTime.UtcNow,
            });
        }
        chat.UpdatedAt = DateTime.UtcNow;

        try
        {
            // Deliberately not cancellable: this runs during client-disconnect cleanup too.
            await db.SaveChangesAsync(CancellationToken.None);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to persist assistant reply for chat {ChatId}", chat.Id);
        }
    }
}
