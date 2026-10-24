using System.Runtime.CompilerServices;
using JoChat.Core.Abstractions;
using JoChat.Core.Entities;
using JoChat.Core.Enums;
using JoChat.Core.Models;
using JoChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JoChat.Api.Services;

public interface IChatStreamingService
{
    IAsyncEnumerable<ChatStreamEvent> SendAndStreamAsync(
        Guid chatId, string text, List<Guid>? attachmentIds, CancellationToken ct);
}

public class ChatStreamingService(
    AppDbContext db,
    ICurrentUserService current,
    IFileStorage storage,
    IServiceProvider services,
    ILogger<ChatStreamingService> logger) : IChatStreamingService
{
    public async IAsyncEnumerable<ChatStreamEvent> SendAndStreamAsync(
        Guid chatId, string text, List<Guid>? attachmentIds,
        [EnumeratorCancellation] CancellationToken ct)
    {
        var user = await current.GetRequiredUserAsync(ct);

        // The SSE response has already started by the time we run, so failures are
        // reported as Error events rather than HTTP status codes.
        var chat = await db.Chats
            .Include(c => c.Persona)
            .Include(c => c.Messages.OrderBy(m => m.CreatedAt))
                .ThenInclude(m => m.Attachments)
            .AsSplitQuery() // two collection includes; avoids a cartesian product over attachments
            .FirstOrDefaultAsync(c => c.Id == chatId && c.OwnerId == user.Id, ct);
        if (chat?.Persona is null)
        {
            yield return new ChatStreamEvent.Error("Chat not found.");
            yield break;
        }
        var persona = chat.Persona;

        var provider = services.GetKeyedService<IChatCompletionProvider>(persona.Provider);
        if (provider is null)
        {
            yield return new ChatStreamEvent.Error($"Unknown chat provider '{persona.Provider}'.");
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
        // Added explicitly: entities discovered via navigation with a pre-set key are tracked
        // as Modified rather than Added, which skips the INSERT and breaks the attachment FK.
        db.Messages.Add(userMessage);
        chat.Messages.Add(userMessage);
        if (chat.Title == ChatTitles.Default)
            chat.Title = ChatTitles.Derive(text);
        chat.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        var history = new List<ChatRequestMessage>(chat.Messages.Count);
        foreach (var m in chat.Messages)
        {
            if (m.Role == MessageRole.Assistant)
            {
                history.Add(new ChatRequestMessage(m.Role, m.Content));
                // The API only accepts image blocks on user turns, so an image the assistant
                // generated is shown back to it as a follow-up user turn.
                var generated = await LoadImagesAsync(m, AttachmentKind.GeneratedImage, ct);
                if (generated is not null)
                    history.Add(new ChatRequestMessage(MessageRole.User, "(This is the image you generated.)", generated));
            }
            else
            {
                history.Add(new ChatRequestMessage(m.Role, m.Content, await LoadImagesAsync(m, AttachmentKind.UploadedImage, ct)));
            }
        }

        var request = new ChatRequest(
            persona.ModelId, persona.SystemPrompt, history, persona.Temperature, persona.MaxTokens);

        var reply = new System.Text.StringBuilder();
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
            if (completed is not null || reply.Length > 0)
                await PersistReplyAsync(chat, user, persona, userMessage, reply.ToString(), completed);
        }
    }

    private async Task PersistReplyAsync(
        Chat chat, UserProfile user, Persona persona, Message userMessage,
        string content, ChatStreamEvent.Completed? completed)
    {
        db.Messages.Add(new Message
        {
            Id = Guid.NewGuid(),
            ChatId = chat.Id,
            ParentMessageId = userMessage.Id,
            Role = MessageRole.Assistant,
            Content = content,
            TokensIn = completed?.TokensIn,
            TokensOut = completed?.TokensOut,
            CreatedAt = DateTime.UtcNow,
        });
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

    private async Task<IReadOnlyList<ChatRequestImage>?> LoadImagesAsync(
        Message m, AttachmentKind kind, CancellationToken ct)
    {
        var images = m.Attachments.Where(a => a.Kind == kind).ToList();
        if (images.Count == 0) return null;

        var result = new List<ChatRequestImage>(images.Count);
        foreach (var a in images)
        {
            await using var stream = await storage.OpenReadAsync(a.StoragePath, ct);
            using var buffer = new MemoryStream();
            await stream.CopyToAsync(buffer, ct);
            result.Add(new ChatRequestImage(a.MimeType, buffer.ToArray()));
        }
        return result;
    }
}
