using JoChat.Core.Abstractions;
using JoChat.Core.Options;
using JoChat.Providers.Anthropic;
using JoChat.Providers.ElevenLabs;
using JoChat.Providers.OpenAi;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http.Resilience;

namespace JoChat.Providers;

public static class DependencyInjection
{
    public static IServiceCollection AddJoChatProviders(
        this IServiceCollection services, IConfiguration config)
    {
        services.Configure<AnthropicOptions>(config.GetSection(AnthropicOptions.Section));
        services.Configure<OpenAiOptions>(config.GetSection(OpenAiOptions.Section));
        services.Configure<ElevenLabsOptions>(config.GetSection(ElevenLabsOptions.Section));

        // No resilience handler here: its default 30s total timeout would cut off long
        // streams, and the Anthropic SDK already retries transient failures itself.
        services.AddHttpClient<AnthropicChatProvider>(c =>
            c.Timeout = TimeSpan.FromMinutes(10)); // streaming = long-lived
        // Image generation and TTS routinely take longer than the resilience defaults (30s total).
        services.AddHttpClient<OpenAiImageProvider>().AddStandardResilienceHandler(LongRunning);
        services.AddHttpClient<OpenAiTtsProvider>().AddStandardResilienceHandler(LongRunning);
        services.AddHttpClient<ElevenLabsTtsProvider>().AddStandardResilienceHandler(LongRunning);

        // Typed HttpClient registrations are the only way to construct these (HttpClient
        // itself isn't a registered service), so the keyed interfaces forward to them.
        services.AddKeyedScoped<IChatCompletionProvider>("anthropic",
            (sp, _) => sp.GetRequiredService<AnthropicChatProvider>());
        services.AddKeyedScoped<IImageGenerationProvider>("openai",
            (sp, _) => sp.GetRequiredService<OpenAiImageProvider>());
        services.AddKeyedScoped<ITtsProvider>("openai",
            (sp, _) => sp.GetRequiredService<OpenAiTtsProvider>());
        services.AddKeyedScoped<ITtsProvider>("elevenlabs",
            (sp, _) => sp.GetRequiredService<ElevenLabsTtsProvider>());
        return services;
    }

    private static void LongRunning(HttpStandardResilienceOptions o)
    {
        o.AttemptTimeout.Timeout = TimeSpan.FromMinutes(2);
        o.TotalRequestTimeout.Timeout = TimeSpan.FromMinutes(5);
        // Must be at least twice the attempt timeout or the options validation rejects it.
        o.CircuitBreaker.SamplingDuration = TimeSpan.FromMinutes(4);
    }
}
