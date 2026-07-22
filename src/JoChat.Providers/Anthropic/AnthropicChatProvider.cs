using System.Runtime.CompilerServices;
using JoChat.Core.Abstractions;
using JoChat.Core.Models;
using JoChat.Core.Options;
using Microsoft.Extensions.Options;

namespace JoChat.Providers.Anthropic;

public class AnthropicChatProvider(HttpClient http, IOptions<AnthropicOptions> options)
    : IChatCompletionProvider
{
    public string ProviderId => "anthropic";

    public async IAsyncEnumerable<ChatStreamEvent> StreamCompletionAsync(
        ChatRequest request, [EnumeratorCancellation] CancellationToken ct)
    {
        // TODO:
        // 1. Build Messages API payload: system prompt as top-level `system`
        //    (consider cache_control for prompt caching), messages with text +
        //    base64 image content blocks, stream: true.
        // 2. POST /v1/messages with x-api-key + anthropic-version headers.
        // 3. Parse SSE: content_block_delta -> TextDelta,
        //    message_delta/message_stop -> Completed(usage).
        yield return new ChatStreamEvent.Error("AnthropicChatProvider not implemented yet.");
        await Task.CompletedTask;
    }
}