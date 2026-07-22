using JoChat.Core.Models;

namespace JoChat.Core.Abstractions;

public interface IChatCompletionProvider
{
    string ProviderId { get; }
    IAsyncEnumerable<ChatStreamEvent> StreamCompletionAsync(ChatRequest request, CancellationToken ct);
}

public interface IImageGenerationProvider
{
    string ProviderId { get; }
    Task<GeneratedImage> GenerateAsync(ImageGenRequest request, CancellationToken ct);
}

public interface ITtsProvider
{
    string ProviderId { get; }
    Task<TtsResult> SynthesizeAsync(TtsRequest request, CancellationToken ct);
    Task<IReadOnlyList<TtsVoice>> GetVoicesAsync(CancellationToken ct);
}