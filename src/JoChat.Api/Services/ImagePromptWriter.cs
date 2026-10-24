using System.Text;
using JoChat.Core.Abstractions;
using JoChat.Core.Entities;
using JoChat.Core.Enums;
using JoChat.Core.Models;

namespace JoChat.Api.Services;

/// <summary>
/// Asks the persona's own chat model to turn an in-chat image request into a concrete image
/// prompt, so the persona's style and the conversation so far shape the picture.
/// </summary>
public class ImagePromptWriter(IServiceProvider services, ILogger<ImagePromptWriter> logger)
{
    // Thinking counts against this; the prompt itself is a paragraph.
    private const int MaxTokens = 2048;

    public record Result(string Prompt, int TokensIn, int TokensOut);

    /// <summary>Returns null when the persona's provider is unavailable or the call fails; callers fall back to the raw request.</summary>
    public async Task<Result?> WriteAsync(
        Persona persona, IReadOnlyList<ChatRequestMessage> history, string request, CancellationToken ct)
    {
        var provider = services.GetKeyedService<IChatCompletionProvider>(persona.Provider);
        if (provider is null) return null;

        var messages = new List<ChatRequestMessage>(history)
        {
            new(MessageRole.User,
                $"""
                 The user wants an image generated. Their request: "{request}"

                 Write the prompt that will be sent to the image generation model. Use the
                 conversation above for context so references to things already discussed are
                 resolved into concrete details, and let your own character and style come
                 through in the artistic direction. Describe the scene concretely: subject,
                 composition, style, lighting, colours.

                 Reply with the image prompt only — no preamble, no quotes, no explanation.
                 """),
        };
        var chatRequest = new ChatRequest(persona.ModelId, persona.SystemPrompt, messages, null, MaxTokens);

        var text = new StringBuilder();
        ChatStreamEvent.Completed? completed = null;
        try
        {
            await foreach (var evt in provider.StreamCompletionAsync(chatRequest, ct))
            {
                switch (evt)
                {
                    case ChatStreamEvent.TextDelta d: text.Append(d.Text); break;
                    case ChatStreamEvent.Completed c: completed = c; break;
                    case ChatStreamEvent.Error e:
                        logger.LogWarning("Image prompt writing failed: {Message}", e.Message);
                        return null;
                }
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Image prompt writing failed");
            return null;
        }

        var prompt = text.ToString().Trim().Trim('"');
        if (prompt.Length == 0 || completed is null) return null;
        return new Result(prompt, completed.TokensIn, completed.TokensOut);
    }
}
