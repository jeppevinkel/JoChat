using JoChat.Core.Abstractions;
using JoChat.Core.Models;
using JoChat.Core.Options;
using Microsoft.Extensions.Options;

namespace JoChat.Providers.ElevenLabs;

public class ElevenLabsTtsProvider(HttpClient http, IOptions<ElevenLabsOptions> options)
    : ITtsProvider
{
    public string ProviderId => "elevenlabs";

    public Task<TtsResult> SynthesizeAsync(TtsRequest request, CancellationToken ct)
    {
        // TODO:
        // POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id} with xi-api-key header,
        // request.Text as `text`, map voice settings; return audio bytes + content-type.
        throw new NotImplementedException();
    }

    public Task<IReadOnlyList<TtsVoice>> GetVoicesAsync(CancellationToken ct)
    {
        // TODO:
        // GET https://api.elevenlabs.io/v1/voices with xi-api-key header; map to TtsVoice list.
        throw new NotImplementedException();
    }
}