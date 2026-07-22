namespace JoChat.Core.Models;

public record ChatRequest(
    string ModelId,
    string SystemPrompt,
    IReadOnlyList<ChatRequestMessage> Messages,
    double? Temperature,
    int? MaxTokens);

public record ChatRequestMessage(
    Enums.MessageRole Role,
    string Text,
    IReadOnlyList<ChatRequestImage>? Images = null);

public record ChatRequestImage(string MimeType, ReadOnlyMemory<byte> Data);

public abstract record ChatStreamEvent
{
    public sealed record TextDelta(string Text) : ChatStreamEvent;
    public sealed record Completed(int TokensIn, int TokensOut, string StopReason) : ChatStreamEvent;
    public sealed record Error(string Message) : ChatStreamEvent;
}

public record ImageGenRequest(string Prompt, string? Size = null, string? Quality = null);
public record GeneratedImage(ReadOnlyMemory<byte> Data, string MimeType);

public record TtsRequest(string Text, string VoiceId, string? ModelId = null);
public record TtsResult(ReadOnlyMemory<byte> Audio, string MimeType);
public record TtsVoice(string Id, string Name, string? PreviewUrl = null);