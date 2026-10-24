using JoChat.Core.Abstractions;
using JoChat.Core.Entities;
using JoChat.Core.Enums;
using JoChat.Core.Models;
using JoChat.Infrastructure.Persistence;

namespace JoChat.Api.Endpoints;

public static class ImageEndpoints
{
    public static RouteGroupBuilder MapImageEndpoints(this RouteGroupBuilder group)
    {
        group.MapPost("/images/generate", async (GenerateImageRequest req, AppDbContext db,
            ICurrentUserService current, IFileStorage storage, IServiceProvider services,
            ILogger<GenerateImageRequest> logger, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Prompt))
                return Results.Problem("Prompt is required.", statusCode: StatusCodes.Status400BadRequest);

            var user = await current.GetRequiredUserAsync(ct);
            var providerId = req.Provider ?? "openai";
            var provider = services.GetKeyedService<IImageGenerationProvider>(providerId);
            if (provider is null)
                return Results.Problem($"Unknown image provider '{providerId}'.",
                    statusCode: StatusCodes.Status400BadRequest);

            GeneratedImage image;
            try
            {
                image = await provider.GenerateAsync(new ImageGenRequest(req.Prompt, req.Size, req.Quality), ct);
            }
            catch (HttpRequestException ex)
            {
                logger.LogWarning(ex, "Image generation via {Provider} failed", providerId);
                return Results.Problem(ex.Message, statusCode: StatusCodes.Status502BadGateway);
            }

            await using var ms = new MemoryStream(image.Data.ToArray());
            var path = await storage.SaveAsync(ms, image.MimeType, ct);

            var attachment = new Attachment
            {
                Id = Guid.NewGuid(),
                OwnerId = user.Id,
                Kind = AttachmentKind.GeneratedImage,
                StoragePath = path,
                MimeType = image.MimeType,
                SizeBytes = image.Data.Length,
                CreatedAt = DateTime.UtcNow,
            };
            db.Attachments.Add(attachment);
            db.UsageRecords.Add(new UsageRecord
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                Provider = providerId,
                ModelOrVoiceId = req.Quality ?? "default",
                Kind = "image",
                Units = 1,
                CreatedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/attachments/{attachment.Id}",
                new { attachment.Id, Url = $"/api/attachments/{attachment.Id}", attachment.MimeType });
        });
        return group;
    }
}

public record GenerateImageRequest(string Prompt, string? Provider, string? Size, string? Quality);
