using System.Runtime.CompilerServices;
using JoChat.Core.Abstractions;
using JoChat.Core.Models;
using JoChat.Infrastructure.Persistence;

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
    IServiceProvider services) : IChatStreamingService
{
    public async IAsyncEnumerable<ChatStreamEvent> SendAndStreamAsync(
        Guid chatId, string text, List<Guid>? attachmentIds,
        [EnumeratorCancellation] CancellationToken ct)
    {
        // TODO:
        // 1. Load chat + persona, verify ownership.
        // 2. Persist user Message (+ link attachments).
        // 3. Build ChatRequest from history (load attachment bytes via IFileStorage).
        // 4. Resolve provider: services.GetRequiredKeyedService<IChatCompletionProvider>(persona.Provider)
        // 5. Stream events through; accumulate text.
        // 6. On Completed: persist assistant Message + UsageRecord, bump chat.UpdatedAt.
        yield break;
    }
}