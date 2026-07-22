using JoChat.Core.Abstractions;
using JoChat.Core.Options;
using JoChat.Providers.Anthropic;
using JoChat.Providers.ElevenLabs;
using JoChat.Providers.OpenAi;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace JoChat.Providers;

public static class DependencyInjection
{
    public static IServiceCollection AddJoChatProviders(
        this IServiceCollection services, IConfiguration config)
    {
        services.Configure<AnthropicOptions>(config.GetSection(AnthropicOptions.Section));
        services.Configure<OpenAiOptions>(config.GetSection(OpenAiOptions.Section));
        services.Configure<ElevenLabsOptions>(config.GetSection(ElevenLabsOptions.Section));

        services.AddHttpClient<AnthropicChatProvider>(c =>
                c.Timeout = TimeSpan.FromMinutes(10)) // streaming = long-lived
            .AddStandardResilienceHandler();
        services.AddHttpClient<OpenAiImageProvider>().AddStandardResilienceHandler();
        services.AddHttpClient<OpenAiTtsProvider>().AddStandardResilienceHandler();
        services.AddHttpClient<ElevenLabsTtsProvider>().AddStandardResilienceHandler();

        services.AddKeyedScoped<IChatCompletionProvider, AnthropicChatProvider>("anthropic");
        services.AddKeyedScoped<IImageGenerationProvider, OpenAiImageProvider>("openai");
        services.AddKeyedScoped<ITtsProvider, OpenAiTtsProvider>("openai");
        services.AddKeyedScoped<ITtsProvider, ElevenLabsTtsProvider>("elevenlabs");
        return services;
    }
}