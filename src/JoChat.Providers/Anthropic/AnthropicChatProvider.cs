using System.Runtime.CompilerServices;
using Anthropic;
using Anthropic.Exceptions;
using Anthropic.Models.Messages;
using JoChat.Core.Abstractions;
using JoChat.Core.Models;
using JoChat.Core.Options;
using Microsoft.Extensions.Options;
using MessageRole = JoChat.Core.Enums.MessageRole;

namespace JoChat.Providers.Anthropic;

public class AnthropicChatProvider : IChatCompletionProvider
{
    // Streaming leaves no HTTP timeout concern, so give the model room unless the persona caps it.
    private const long DefaultMaxTokens = 64_000;

    private readonly AnthropicClient _client;

    public AnthropicChatProvider(HttpClient http, IOptions<AnthropicOptions> options)
    {
        _client = new AnthropicClient
        {
            ApiKey = options.Value.ApiKey,
            BaseUrl = options.Value.BaseUrl,
            HttpClient = http,
            Timeout = http.Timeout,
        };
    }

    public string ProviderId => "anthropic";

    public async IAsyncEnumerable<ChatStreamEvent> StreamCompletionAsync(
        ChatRequest request, [EnumeratorCancellation] CancellationToken ct)
    {
        var parameters = BuildParams(request);

        long tokensIn = 0, tokensOut = 0;
        var stopReason = "end_turn";

        // `yield` can't live inside try/catch, so drive the enumerator by hand and
        // surface SDK failures as an Error event instead of tearing down the SSE stream.
        await using var events = _client.Messages.CreateStreaming(parameters, cancellationToken: ct)
            .GetAsyncEnumerator(ct);
        while (true)
        {
            RawMessageStreamEvent evt;
            string? error = null;
            try
            {
                if (!await events.MoveNextAsync()) break;
                evt = events.Current;
            }
            catch (AnthropicException ex)
            {
                error = DescribeError(ex);
                evt = null!;
            }
            if (error is not null)
            {
                yield return new ChatStreamEvent.Error(error);
                yield break;
            }

            if (evt.TryPickStart(out var start))
            {
                // Cached tokens are billed separately but still count as context the model read.
                var u = start.Message.Usage;
                tokensIn = u.InputTokens + (u.CacheReadInputTokens ?? 0) + (u.CacheCreationInputTokens ?? 0);
            }
            else if (evt.TryPickContentBlockDelta(out var blockDelta)
                     && blockDelta.Delta.TryPickText(out var text))
            {
                yield return new ChatStreamEvent.TextDelta(text.Text);
            }
            else if (evt.TryPickDelta(out var messageDelta))
            {
                tokensOut = messageDelta.Usage.OutputTokens;
                if (messageDelta.Delta.StopReason is { } sr)
                    stopReason = sr.Raw();
            }
        }

        yield return new ChatStreamEvent.Completed((int)tokensIn, (int)tokensOut, stopReason);
    }

    private static MessageCreateParams BuildParams(ChatRequest request)
    {
        // The persona prompt is the stable prefix across every turn of a chat, so mark it
        // as a cache breakpoint (short prompts simply won't cache; that's harmless).
        MessageCreateParamsSystem? system = null;
        if (!string.IsNullOrWhiteSpace(request.SystemPrompt))
        {
            system = new List<TextBlockParam>
            {
                new() { Text = request.SystemPrompt, CacheControl = new CacheControlEphemeral() },
            };
        }

        return new MessageCreateParams
        {
            Model = request.ModelId,
            MaxTokens = request.MaxTokens ?? DefaultMaxTokens,
            System = system,
            Messages = request.Messages.Select(ToMessageParam).ToList(),
            // Temperature is intentionally not forwarded: current models reject sampling
            // parameters, and thinking is left at the model's adaptive default.
        };
    }

    private static MessageParam ToMessageParam(ChatRequestMessage m)
    {
        MessageContentParam content = m.Images is { Count: > 0 } ? ToContentBlocks(m) : m.Text;
        return m.Role == MessageRole.Assistant
            ? new AssistantMessageParam(content)
            : new UserMessageParam(content);
    }

    private static List<ContentBlockParam> ToContentBlocks(ChatRequestMessage m)
    {

        var blocks = new List<ContentBlockParam>();
        foreach (var img in m.Images!)
        {
            blocks.Add(new ImageBlockParam
            {
                Source = new Base64ImageSource
                {
                    MediaType = img.MimeType,
                    Data = Convert.ToBase64String(img.Data.Span),
                },
            });
        }
        if (!string.IsNullOrEmpty(m.Text))
            blocks.Add(new TextBlockParam { Text = m.Text });
        return blocks;
    }

    private static string DescribeError(AnthropicException ex) => ex switch
    {
        AnthropicRateLimitException => "Anthropic rate limit reached. Please try again shortly.",
        AnthropicUnauthorizedException => "Anthropic API key was rejected.",
        AnthropicBadRequestException => $"Anthropic rejected the request: {ex.Message}",
        Anthropic5xxException => "Anthropic is currently unavailable. Please try again.",
        _ => $"Anthropic request failed: {ex.Message}",
    };
}
