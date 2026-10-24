using JoChat.Core.Abstractions;
using JoChat.Core.Entities;
using JoChat.Core.Enums;
using JoChat.Core.Models;
using JoChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

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

        // Speak either free text or a stored message. For a message the audio is cached as a
        // TtsAudio attachment on it, so replays serve the file instead of paying for synthesis again.
        group.MapPost("/tts/speak", async (SpeakRequest req, AppDbContext db, ICurrentUserService current,
            IServiceProvider services, IFileStorage storage, ILogger<TtsRequest> logger, CancellationToken ct) =>
        {
            var user = await current.GetRequiredUserAsync(ct);

            Message? message = null;
            string text;
            if (req.MessageId is { } messageId)
            {
                message = await db.Messages
                    .Include(m => m.Attachments)
                    .FirstOrDefaultAsync(m => m.Id == messageId && m.Chat!.OwnerId == user.Id, ct);
                if (message is null) return Results.NotFound();

                var cached = message.Attachments.FirstOrDefault(a => a.Kind == AttachmentKind.TtsAudio);
                if (cached is not null)
                {
                    var stream = await storage.OpenReadAsync(cached.StoragePath, ct);
                    return Results.File(stream, cached.MimeType, enableRangeProcessing: true);
                }
                text = message.Content;
            }
            else
            {
                text = req.Text ?? "";
            }

            if (string.IsNullOrWhiteSpace(text))
                return Results.Problem("Text is required.", statusCode: StatusCodes.Status400BadRequest);
            if (text.Length > MaxTtsCharacters)
                return Results.Problem($"Text exceeds {MaxTtsCharacters} characters.",
                    statusCode: StatusCodes.Status400BadRequest);

            var tts = services.GetKeyedService<ITtsProvider>(req.Provider);
            if (tts is null)
                return Results.Problem($"Unknown TTS provider '{req.Provider}'.",
                    statusCode: StatusCodes.Status400BadRequest);

            TtsResult result;
            try
            {
                result = await tts.SynthesizeAsync(new TtsRequest(text, req.VoiceId, req.ModelId), ct);
            }
            catch (HttpRequestException ex)
            {
                logger.LogWarning(ex, "TTS via {Provider} failed", req.Provider);
                return Results.Problem(ex.Message, statusCode: StatusCodes.Status502BadGateway);
            }

            var audio = result.Audio.ToArray();
            if (message is not null)
            {
                await using var ms = new MemoryStream(audio);
                var path = await storage.SaveAsync(ms, result.MimeType, ct);
                db.Attachments.Add(new Attachment
                {
                    Id = Guid.NewGuid(),
                    MessageId = message.Id,
                    OwnerId = user.Id,
                    Kind = AttachmentKind.TtsAudio,
                    StoragePath = path,
                    MimeType = result.MimeType,
                    SizeBytes = audio.Length,
                    CreatedAt = DateTime.UtcNow,
                });
            }

            db.UsageRecords.Add(new UsageRecord
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                Provider = req.Provider,
                ModelOrVoiceId = req.VoiceId,
                Kind = "tts",
                Units = text.Length,
                CreatedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync(ct);

            return Results.File(audio, result.MimeType);
        });
        return group;
    }
}

/// <summary>Either <see cref="Text"/> (ad hoc) or <see cref="MessageId"/> (cached per message) must be given.</summary>
public record SpeakRequest(string? Text, Guid? MessageId, string Provider, string VoiceId, string? ModelId);
