namespace JoChat.Core.Models;

public record ChatRequest(
    string ModelId,
    string SystemPrompt,
    IReadOnlyList<ChatRequestMessage> Messages,
    double? Temperature,
    int? MaxTokens,
    IReadOnlyList<string>? Tools = null);

/// <summary>Provider-hosted tools a persona may enable; ids are stable across providers.</summary>
public static class ChatTools
{
    public const string WebSearch = "web_search";
    public const string WebFetch = "web_fetch";
    public const string CodeExecution = "code_execution";
}

/// <summary>One visible step of tool activity during a reply, kept for display after reload.</summary>
public record ToolStep(string Kind, string Tool, string Label, bool IsError = false)
{
    public const string Use = "use";
    public const string Result = "result";
}

/// <param name="RawContent">Provider-native content blocks of a previous assistant turn (JSON), replayed verbatim
/// when <paramref name="RawContentFormat"/> matches the provider; otherwise <paramref name="Text"/> is used.</param>
public record ChatRequestMessage(
    Enums.MessageRole Role,
    string Text,
    IReadOnlyList<ChatRequestImage>? Images = null,
    string? RawContent = null,
    string? RawContentFormat = null);

public record ChatRequestImage(string MimeType, ReadOnlyMemory<byte> Data);

public abstract record ChatStreamEvent
{
    public sealed record TextDelta(string Text) : ChatStreamEvent;
    public sealed record ToolUse(string Tool, string Label) : ChatStreamEvent;
    public sealed record ToolResult(string Tool, string Label, bool IsError) : ChatStreamEvent;
    /// <summary>A file the model produced (e.g. from code execution).</summary>
    public sealed record File(string FileName, string MimeType, ReadOnlyMemory<byte> Data) : ChatStreamEvent;
    /// <param name="RawContent">The assistant turn as provider-native content blocks (JSON), for faithful replay.</param>
    public sealed record Completed(
        int TokensIn, int TokensOut, string StopReason,
        string? RawContent = null, string? RawContentFormat = null) : ChatStreamEvent;
    public sealed record Error(string Message) : ChatStreamEvent;
}

public record ImageGenRequest(string Prompt, string? Size = null, string? Quality = null);
public record GeneratedImage(ReadOnlyMemory<byte> Data, string MimeType);

public record TtsRequest(string Text, string VoiceId, string? ModelId = null);
public record TtsResult(ReadOnlyMemory<byte> Audio, string MimeType);
public record TtsVoice(string Id, string Name, string? PreviewUrl = null);