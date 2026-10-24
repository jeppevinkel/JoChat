using JoChat.Core.Abstractions;
using JoChat.Core.Entities;
using JoChat.Core.Models;
using JoChat.Infrastructure.Persistence;

namespace JoChat.Api.Endpoints;

public static class TtsEndpoints
{
    private const int MaxTtsCharacters = 5000;

    public static RouteGroupBuilder MapTtsEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/tts/voices", async (string provider, IServiceProvider services,
            ILogger<TtsRequest> logger, CancellationToken ct) =>
        {
            var tts = services.GetKeyedService<ITtsProvider>(provider);
            if (tts is null)
                return Results.Problem($"Unknown TTS provider '{provider}'.", statusCode: StatusCodes.Status400BadRequest);

            try
            {
                return Results.Ok(await tts.GetVoicesAsync(ct));
            }
            catch (HttpRequestException ex)
            {
                logger.LogWarning(ex, "Listing voices via {Provider} failed", provider);
                return Results.Problem(ex.Message, statusCode: StatusCodes.Status502BadGateway);
            }
        });

        group.MapPost("/tts/speak", async (SpeakRequest req, AppDbContext db, ICurrentUserService current,
            IServiceProvider services, ILogger<TtsRequest> logger, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Text))
                return Results.Problem("Text is required.", statusCode: StatusCodes.Status400BadRequest);
            if (req.Text.Length > MaxTtsCharacters)
                return Results.Problem($"Text exceeds {MaxTtsCharacters} characters.",
                    statusCode: StatusCodes.Status400BadRequest);

            var user = await current.GetRequiredUserAsync(ct);
            var tts = services.GetKeyedService<ITtsProvider>(req.Provider);
            if (tts is null)
                return Results.Problem($"Unknown TTS provider '{req.Provider}'.",
                    statusCode: StatusCodes.Status400BadRequest);

            TtsResult result;
            try
            {
                result = await tts.SynthesizeAsync(new TtsRequest(req.Text, req.VoiceId, req.ModelId), ct);
            }
            catch (HttpRequestException ex)
            {
                logger.LogWarning(ex, "TTS via {Provider} failed", req.Provider);
                return Results.Problem(ex.Message, statusCode: StatusCodes.Status502BadGateway);
            }

            db.UsageRecords.Add(new UsageRecord
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                Provider = req.Provider,
                ModelOrVoiceId = req.VoiceId,
                Kind = "tts",
                Units = req.Text.Length,
                CreatedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync(ct);

            // Audio is returned inline rather than stored; clients can replay from their own cache.
            return Results.File(result.Audio.ToArray(), result.MimeType);
        });
        return group;
    }
}

public record SpeakRequest(string Text, string Provider, string VoiceId, string? ModelId);
