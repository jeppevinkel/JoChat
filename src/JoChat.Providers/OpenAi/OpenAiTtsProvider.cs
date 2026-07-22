using JoChat.Core.Abstractions;
using JoChat.Core.Models;
using JoChat.Core.Options;
using Microsoft.Extensions.Options;

namespace JoChat.Providers.OpenAi;

public class OpenAiTtsProvider(HttpClient http, IOptions<OpenAiOptions> options)
    : ITtsProvider
{
    public string ProviderId => "openai";
    public Task<TtsResult> SynthesizeAsync(TtsRequest request, CancellationToken ct)
    {
        // TODO
        throw new NotImplementedException();
    }

    public Task<IReadOnlyList<TtsVoice>> GetVoicesAsync(CancellationToken ct)
    {
        // TODO
        throw new NotImplementedException();
    }
}