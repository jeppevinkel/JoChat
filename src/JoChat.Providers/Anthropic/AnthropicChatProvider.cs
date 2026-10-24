using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using Anthropic;
using Anthropic.Exceptions;
using Anthropic.Helpers;
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
    // Caps per turn on the hosted tools, and on how often a pause_turn is resumed.
    private const long MaxToolUses = 8;
    private const int MaxTurnResumes = 4;

    /// <summary>Format tag for replayed content so another provider never tries to interpret it.</summary>
    public const string ContentFormat = "anthropic.messages";

    private readonly AnthropicClient _client;
    private readonly bool _configured;

    public AnthropicChatProvider(HttpClient http, IOptions<AnthropicOptions> options)
    {
        _configured = !string.IsNullOrWhiteSpace(options.Value.ApiKey);
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
        if (!_configured)
        {
            yield return new ChatStreamEvent.Error(
                "Anthropic API key is not configured (Anthropic:ApiKey). Set it via user secrets or environment.");
            yield break;
        }

        var messages = request.Messages.Select(ToMessageParam).ToList();
        long tokensIn = 0, tokensOut = 0;
        var stopReason = "end_turn";
        var produced = new List<JsonElement>(); // every content block of this turn, across pause_turn rounds

        // Server tools can pause a long turn (stop_reason pause_turn); the partial assistant
        // turn is replayed verbatim and the request re-sent to let it continue.
        for (var round = 0; ; round++)
        {
            var aggregator = new MessageContentAggregator();
            var parameters = BuildParams(request, messages);
            var pending = new Dictionary<long, PendingToolUse>();
            var enabled = (request.Tools ?? []).ToHashSet();
            // Search/fetch run under a filtering harness that reports the same call at two levels;
            // consecutive identical activity is collapsed to one entry.
            ChatStreamEvent? lastActivity = null;

            // `yield` can't live inside try/catch, so drive the enumerator by hand and
            // surface SDK failures as an Error event instead of tearing down the SSE stream.
            await using var events = _client.Messages.CreateStreaming(parameters, cancellationToken: ct)
                .CollectAsync(aggregator).GetAsyncEnumerator(ct);
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
                    tokensIn += u.InputTokens + (u.CacheReadInputTokens ?? 0) + (u.CacheCreationInputTokens ?? 0);
                }
                else if (evt.TryPickContentBlockStart(out var blockStart))
                {
                    foreach (var e in OnBlockStart(blockStart, pending, enabled))
                    {
                        if (e.Equals(lastActivity)) continue;
                        lastActivity = e;
                        yield return e;
                    }
                }
                else if (evt.TryPickContentBlockDelta(out var blockDelta))
                {
                    if (blockDelta.Delta.TryPickText(out var text))
                        yield return new ChatStreamEvent.TextDelta(text.Text);
                    else if (blockDelta.Delta.TryPickInputJson(out var json) && pending.TryGetValue(blockDelta.Index, out var p))
                        p.Json.Append(json.PartialJson);
                }
                else if (evt.TryPickContentBlockStop(out var blockStop))
                {
                    if (pending.Remove(blockStop.Index, out var p))
                    {
                        var use = new ChatStreamEvent.ToolUse(Normalize(p.Tool), DescribeToolUse(p));
                        if (!use.Equals(lastActivity))
                        {
                            lastActivity = use;
                            yield return use;
                        }
                    }
                }
                else if (evt.TryPickDelta(out var messageDelta))
                {
                    tokensOut += messageDelta.Usage.OutputTokens;
                    if (messageDelta.Delta.StopReason is { } sr)
                        stopReason = sr.Raw();
                }
            }

            var assistant = aggregator.Message();
            produced.AddRange(assistant.Content.Select(b => b.Json));

            // Files the sandbox wrote (code execution) are fetched so they reach the user.
            if (enabled.Contains(ChatTools.CodeExecution))
            {
                foreach (var fileId in ProducedFileIds(assistant))
                {
                    ChatStreamEvent.File? file = null;
                    try { file = await DownloadAsync(fileId, ct); }
                    catch (AnthropicException) { /* the reply still stands without the file */ }
                    if (file is not null) yield return file;
                }
            }

            if (stopReason != "pause_turn" || round >= MaxTurnResumes) break;

            // Replay what the model produced so far exactly as received, then continue.
            messages.Add(new AssistantMessageParam(
                new MessageContentParam(assistant.Content.Select(b => new ContentBlockParam(b.Json)).ToList())));
        }

        yield return new ChatStreamEvent.Completed((int)tokensIn, (int)tokensOut, stopReason,
            produced.Count == 0 ? null : JsonSerializer.Serialize(produced), ContentFormat);
    }

    private static IEnumerable<string> ProducedFileIds(Message message)
    {
        foreach (var block in message.Content)
        {
            if (!block.TryPickBashCodeExecutionToolResult(out var exec)) continue;
            if (!exec.Content.TryPickBashCodeExecutionResultBlock(out var result)) continue;
            foreach (var output in result.Content)
                yield return output.FileID;
        }
    }

    private async Task<ChatStreamEvent.File> DownloadAsync(string fileId, CancellationToken ct)
    {
        var meta = await _client.Files.RetrieveMetadata(fileId, cancellationToken: ct);
        var response = await _client.Files.Download(fileId, cancellationToken: ct);
        await using var stream = await response.ReadAsStream(ct);
        using var buffer = new MemoryStream();
        await stream.CopyToAsync(buffer, ct);
        return new ChatStreamEvent.File(meta.Filename, meta.MimeType, buffer.ToArray());
    }

    private sealed class PendingToolUse(string tool)
    {
        public string Tool { get; } = tool;
        public StringBuilder Json { get; } = new();
    }

    // The hosted tools report sub-tools (bash_code_execution, and the code_execution harness that
    // web search/fetch run under for result filtering) by their own names; map them onto the
    // persona-level ids so activity can be filtered to what the persona actually enabled.
    private static string Normalize(string tool) => tool switch
    {
        "bash_code_execution" or "text_editor_code_execution" => ChatTools.CodeExecution,
        _ => tool,
    };

    private static IEnumerable<ChatStreamEvent> OnBlockStart(
        RawContentBlockStartEvent start, Dictionary<long, PendingToolUse> pending, HashSet<string> enabled)
    {
        var block = start.ContentBlock;
        if (block.TryPickServerToolUse(out var use))
        {
            var tool = use.Name.Raw();
            if (!enabled.Contains(Normalize(tool))) return [];
            var p = new PendingToolUse(tool);
            // A call made from inside the code-execution harness carries its input here in full;
            // a direct call streams it through input_json_delta events instead.
            if (use.Input.Count > 0) p.Json.Append(JsonSerializer.Serialize(use.Input));
            pending[start.Index] = p;
            return [];
        }
        return OnResultBlock(block, enabled);
    }

    private static IEnumerable<ChatStreamEvent> OnResultBlock(RawContentBlockStartEventContentBlock block, HashSet<string> enabled)
    {
        if (block.TryPickWebSearchToolResult(out var search) && enabled.Contains(ChatTools.WebSearch))
        {
            if (search.Content.TryPickWebSearchResultBlocks(out var results))
                yield return new ChatStreamEvent.ToolResult(ChatTools.WebSearch,
                    results.Count == 0 ? "No results" : $"{results.Count} results: " + string.Join(", ", results.Take(3).Select(r => r.Title)), false);
            else if (search.Content.TryPickError(out var err))
                yield return new ChatStreamEvent.ToolResult(ChatTools.WebSearch, $"Search failed ({err.ErrorCode.Raw()})", true);
        }
        else if (block.TryPickWebFetchToolResult(out var fetch) && enabled.Contains(ChatTools.WebFetch))
        {
            if (fetch.Content.TryPickWebFetchBlock(out var page))
                yield return new ChatStreamEvent.ToolResult(ChatTools.WebFetch, $"Fetched {page.Content.Title ?? page.Url}", false);
            else if (fetch.Content.TryPickWebFetchToolResultErrorBlock(out var err))
                yield return new ChatStreamEvent.ToolResult(ChatTools.WebFetch, $"Fetch failed ({err.ErrorCode.Raw()})", true);
        }
        else if (block.TryPickBashCodeExecutionToolResult(out var exec) && enabled.Contains(ChatTools.CodeExecution))
        {
            if (exec.Content.TryPickBashCodeExecutionResultBlock(out var result))
            {
                var firstLine = result.Stdout.Split('\n', 2)[0].Trim();
                var summary = result.ReturnCode == 0 ? "Ran code" : $"Code exited with {result.ReturnCode}";
                if (firstLine.Length > 0) summary += $": {Truncate(firstLine, 80)}";
                if (result.Content.Count > 0) summary += $" · {result.Content.Count} file{(result.Content.Count == 1 ? "" : "s")}";
                yield return new ChatStreamEvent.ToolResult(ChatTools.CodeExecution, summary, result.ReturnCode != 0);
            }
            else if (exec.Content.TryPickBashCodeExecutionToolResultError(out var err))
                yield return new ChatStreamEvent.ToolResult(ChatTools.CodeExecution, $"Code execution failed ({err.ErrorCode.Raw()})", true);
        }
    }

    private static string DescribeToolUse(PendingToolUse p)
    {
        Dictionary<string, JsonElement>? input = null;
        try
        {
            if (p.Json.Length > 0)
                input = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(p.Json.ToString());
        }
        catch (JsonException)
        {
            // Partial or malformed input: fall back to a generic label.
        }
        string? Arg(string key) => input is not null && input.TryGetValue(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

        return p.Tool switch
        {
            "web_search" => Arg("query") is { } q ? $"Searched for \"{Truncate(q, 100)}\"" : "Searched the web",
            "web_fetch" => Arg("url") is { } url ? $"Fetching {Truncate(url, 100)}" : "Fetching a page",
            "bash_code_execution" => Arg("command") is { } cmd ? $"Running: {Truncate(cmd, 100)}" : "Running code",
            "code_execution" => Arg("code") is { } code ? $"Running: {Truncate(code.Split('\n')[0], 100)}" : "Running code",
            "text_editor_code_execution" => "Editing a file in the sandbox",
            _ => $"Using {p.Tool}",
        };
    }

    private static string Truncate(string s, int max) => s.Length <= max ? s : s[..max].TrimEnd() + "…";

    private static MessageCreateParams BuildParams(ChatRequest request, List<MessageParam> messages)
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

        List<ToolUnion>? tools = null;
        foreach (var id in request.Tools ?? [])
        {
            tools ??= [];
            switch (id)
            {
                case ChatTools.WebSearch: tools.Add(new WebSearchTool20260209 { MaxUses = MaxToolUses }); break;
                case ChatTools.WebFetch: tools.Add(new WebFetchTool20260209 { MaxUses = MaxToolUses }); break;
                case ChatTools.CodeExecution: tools.Add(new CodeExecutionTool20260521()); break;
            }
        }

        return new MessageCreateParams
        {
            Model = request.ModelId,
            MaxTokens = request.MaxTokens ?? DefaultMaxTokens,
            System = system,
            Messages = messages,
            Tools = tools,
            // Temperature is intentionally not forwarded: current models reject sampling
            // parameters, and thinking is left at the model's adaptive default.
        };
    }

    private static MessageParam ToMessageParam(ChatRequestMessage m)
    {
        if (m.Role == MessageRole.Assistant && m.RawContent is not null && m.RawContentFormat == ContentFormat)
        {
            // Replay the turn as the model produced it, tool calls and results included, so it
            // knows what it actually did rather than seeing only the prose.
            var blocks = JsonSerializer.Deserialize<List<JsonElement>>(m.RawContent) ?? [];
            if (blocks.Count > 0)
                return new AssistantMessageParam(new MessageContentParam(blocks.Select(b => new ContentBlockParam(b)).ToList()));
        }
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
