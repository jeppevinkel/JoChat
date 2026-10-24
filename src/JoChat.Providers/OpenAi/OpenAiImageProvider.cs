using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using JoChat.Core.Abstractions;
using JoChat.Core.Models;
using JoChat.Core.Options;
using Microsoft.Extensions.Options;

namespace JoChat.Providers.OpenAi;

public class OpenAiImageProvider(HttpClient http, IOptions<OpenAiOptions> options)
    : IImageGenerationProvider
{
    private const string BaseUrl = "https://api.openai.com/v1/";

    public string ProviderId => "openai";

    public async Task<GeneratedImage> GenerateAsync(ImageGenRequest request, CancellationToken ct)
    {
        using var msg = new HttpRequestMessage(HttpMethod.Post, BaseUrl + "images/generations");
        msg.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.Value.ApiKey);
        msg.Content = JsonContent.Create(new ImageRequest(
            options.Value.ImageModel, request.Prompt, request.Size, request.Quality));

        using var response = await http.SendAsync(msg, ct);
        await OpenAiErrors.ThrowIfFailedAsync(response, ct);

        // gpt-image-* models always return base64; there is no URL variant.
        var body = await response.Content.ReadFromJsonAsync<ImageResponse>(ct)
                   ?? throw new InvalidOperationException("Empty response from OpenAI images API.");
        var b64 = body.Data.FirstOrDefault()?.B64Json
                  ?? throw new InvalidOperationException("OpenAI images API returned no image data.");

        return new GeneratedImage(Convert.FromBase64String(b64), "image/png");
    }

    private record ImageRequest(
        [property: JsonPropertyName("model")] string Model,
        [property: JsonPropertyName("prompt")] string Prompt,
        [property: JsonPropertyName("size"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Size,
        [property: JsonPropertyName("quality"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Quality,
        [property: JsonPropertyName("n")] int N = 1);

    private record ImageResponse([property: JsonPropertyName("data")] List<ImageDatum> Data);
    private record ImageDatum([property: JsonPropertyName("b64_json")] string? B64Json);
}
