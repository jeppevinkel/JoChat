using System.Net.Http.Json;
using System.Text.Json.Serialization;
using JoChat.Core.Abstractions;
using JoChat.Core.Models;
using JoChat.Core.Options;
using Microsoft.Extensions.Options;

namespace JoChat.Providers.ElevenLabs;

public class ElevenLabsTtsProvider(HttpClient http, IOptions<ElevenLabsOptions> options)
    : ITtsProvider
{
    private const string BaseUrl = "https://api.elevenlabs.io/v1/";
    private const string DefaultModel = "eleven_multilingual_v2";

    public string ProviderId => "elevenlabs";

    public async Task<TtsResult> SynthesizeAsync(TtsRequest request, CancellationToken ct)
    {
        using var msg = new HttpRequestMessage(HttpMethod.Post,
            $"{BaseUrl}text-to-speech/{Uri.EscapeDataString(request.VoiceId)}");
        msg.Headers.Add("xi-api-key", options.Value.ApiKey);
        msg.Headers.Accept.ParseAdd("audio/mpeg");
        msg.Content = JsonContent.Create(new SpeechRequest(request.Text, request.ModelId ?? DefaultModel));

        using var response = await http.SendAsync(msg, ct);
        await ThrowIfFailedAsync(response, ct);

        var audio = await response.Content.ReadAsByteArrayAsync(ct);
        return new TtsResult(audio, response.Content.Headers.ContentType?.MediaType ?? "audio/mpeg");
    }

    public async Task<IReadOnlyList<TtsVoice>> GetVoicesAsync(CancellationToken ct)
    {
        using var msg = new HttpRequestMessage(HttpMethod.Get, BaseUrl + "voices");
        msg.Headers.Add("xi-api-key", options.Value.ApiKey);

        using var response = await http.SendAsync(msg, ct);
        await ThrowIfFailedAsync(response, ct);

        var body = await response.Content.ReadFromJsonAsync<VoicesResponse>(ct);
        return body?.Voices.Select(v => new TtsVoice(v.VoiceId, v.Name, v.PreviewUrl)).ToList() ?? [];
    }

    private static async Task ThrowIfFailedAsync(HttpResponseMessage response, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode) return;
        var detail = await response.Content.ReadAsStringAsync(ct);
        throw new HttpRequestException(
            $"ElevenLabs request failed ({(int)response.StatusCode}): {detail}",
            null, response.StatusCode);
    }

    private record SpeechRequest(
        [property: JsonPropertyName("text")] string Text,
        [property: JsonPropertyName("model_id")] string ModelId);

    private record VoicesResponse([property: JsonPropertyName("voices")] List<Voice> Voices);
    private record Voice(
        [property: JsonPropertyName("voice_id")] string VoiceId,
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("preview_url")] string? PreviewUrl);
}
