using JoChat.Core.Abstractions;
using JoChat.Core.Entities;
using JoChat.Core.Enums;
using JoChat.Core.Models;

namespace JoChat.Api.Services;

/// <summary>Turns a chat's stored messages into provider request messages, loading image bytes.</summary>
public static class ChatHistory
{
    /// <summary><paramref name="messages"/> must be ordered and have Attachments loaded.</summary>
    public static async Task<List<ChatRequestMessage>> BuildAsync(
        IEnumerable<Message> messages, IFileStorage storage, CancellationToken ct)
    {
        var history = new List<ChatRequestMessage>();
        foreach (var m in messages)
        {
            if (m.Role == MessageRole.Assistant)
            {
                history.Add(new ChatRequestMessage(m.Role, m.Content));
                // The API only accepts image blocks on user turns, so an image the assistant
                // generated is shown back to it as a follow-up user turn.
                var generated = await LoadImagesAsync(m, AttachmentKind.GeneratedImage, storage, ct);
                if (generated is not null)
                    history.Add(new ChatRequestMessage(MessageRole.User, "(This is the image you generated.)", generated));
            }
            else
            {
                history.Add(new ChatRequestMessage(m.Role, m.Content,
                    await LoadImagesAsync(m, AttachmentKind.UploadedImage, storage, ct)));
            }
        }
        return history;
    }

    private static async Task<IReadOnlyList<ChatRequestImage>?> LoadImagesAsync(
        Message m, AttachmentKind kind, IFileStorage storage, CancellationToken ct)
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
