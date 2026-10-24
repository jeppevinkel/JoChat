using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace JoChat.Providers.OpenAi;

internal static class OpenAiErrors
{
    /// <summary>Surfaces OpenAI's error message instead of a bare status code.</summary>
    public static async Task ThrowIfFailedAsync(HttpResponseMessage response, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode) return;

        string? detail = null;
        try
        {
            detail = (await response.Content.ReadFromJsonAsync<ErrorEnvelope>(ct))?.Error?.Message;
        }
        catch
        {
            // Non-JSON error body; fall through to the status code.
        }

        throw new HttpRequestException(
            $"OpenAI request failed ({(int)response.StatusCode}): {detail ?? response.ReasonPhrase}",
            null, response.StatusCode);
    }

    private record ErrorEnvelope([property: JsonPropertyName("error")] ErrorBody? Error);
    private record ErrorBody([property: JsonPropertyName("message")] string? Message);
}
