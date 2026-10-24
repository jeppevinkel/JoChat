using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using JoChat.Core.Abstractions;
using JoChat.Core.Models;
using JoChat.Core.Options;
using Microsoft.Extensions.Options;

namespace JoChat.Providers.OpenAi;

public class OpenAiTtsProvider(HttpClient http, IOptions<OpenAiOptions> options)
    : ITtsProvider
{
    private const string BaseUrl = "https://api.openai.com/v1/";

    // OpenAI has no voices endpoint; the set is fixed and documented.
    private static readonly IReadOnlyList<TtsVoice> Voices =
    [
        new("alloy", "Alloy"), new("ash", "Ash"), new("ballad", "Ballad"), new("coral", "Coral"),
        new("echo", "Echo"), new("fable", "Fable"), new("onyx", "Onyx"), new("nova", "Nova"),
        new("sage", "Sage"), new("shimmer", "Shimmer"), new("verse", "Verse"),
    ];

    public string ProviderId => "openai";

    public async Task<TtsResult> SynthesizeAsync(TtsRequest request, CancellationToken ct)
    {
        using var msg = new HttpRequestMessage(HttpMethod.Post, BaseUrl + "audio/speech");
        msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.Value.ApiKey);
        msg.Content = JsonContent.Create(new SpeechRequest(
            request.ModelId ?? options.Value.TtsModel, request.Text, request.VoiceId));

        using var response = await http.SendAsync(msg, ct);
        await OpenAiErrors.ThrowIfFailedAsync(response, ct);

        var audio = await response.Content.ReadAsByteArrayAsync(ct);
        return new TtsResult(audio, "audio/mpeg");
    }

    public Task<IReadOnlyList<TtsVoice>> GetVoicesAsync(CancellationToken ct) => Task.FromResult(Voices);

    private record SpeechRequest(
        [property: JsonPropertyName("model")] string Model,
        [property: JsonPropertyName("input")] string Input,
        [property: JsonPropertyName("voice")] string Voice,
        [property: JsonPropertyName("response_format")] string ResponseFormat = "mp3");
}
