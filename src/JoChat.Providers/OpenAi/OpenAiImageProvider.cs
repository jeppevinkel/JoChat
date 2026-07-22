using JoChat.Core.Abstractions;
using JoChat.Core.Models;
using JoChat.Core.Options;
using Microsoft.Extensions.Options;

namespace JoChat.Providers.OpenAi;

public class OpenAiImageProvider(HttpClient http, IOptions<OpenAiOptions> options)
    : IImageGenerationProvider
{
    public string ProviderId => "openai";
    
    public Task<GeneratedImage> GenerateAsync(ImageGenRequest request, CancellationToken ct)
    {
        // TODO
        throw new NotImplementedException();
    }
}