using JoChat.Api.Services;
using JoChat.Core.Abstractions;
using JoChat.Core.Entities;
using JoChat.Core.Enums;
using JoChat.Core.Models;
using JoChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

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

            // When generated from inside a chat the image is recorded as a turn, so it survives
            // reloads and later model turns can see that an image was produced.
            Chat? chat = null;
            if (req.ChatId is { } chatId)
            {
                chat = await db.Chats.FirstOrDefaultAsync(c => c.Id == chatId && c.OwnerId == user.Id, ct);
                if (chat is null) return Results.NotFound();
            }

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

            Guid? messageId = null;
            if (chat is not null)
            {
                var now = DateTime.UtcNow;
                var prompt = new Message
                {
                    Id = Guid.NewGuid(), ChatId = chat.Id, Role = MessageRole.User,
                    Content = req.Prompt, CreatedAt = now,
                };
                var reply = new Message
                {
                    Id = Guid.NewGuid(), ChatId = chat.Id, Role = MessageRole.Assistant,
                    ParentMessageId = prompt.Id, Content = $"Generated an image for: {req.Prompt}",
                    CreatedAt = now.AddMilliseconds(1), // keep ordering stable within the same tick
                };
                attachment.MessageId = reply.Id;
                db.Messages.AddRange(prompt, reply);
                if (chat.Title == ChatTitles.Default) chat.Title = ChatTitles.Derive(req.Prompt);
                chat.UpdatedAt = now;
                messageId = reply.Id;
            }

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
                new { attachment.Id, Url = $"/api/attachments/{attachment.Id}", attachment.MimeType, MessageId = messageId });
        });
        return group;
    }
}

public record GenerateImageRequest(string Prompt, string? Provider, string? Size, string? Quality, Guid? ChatId);
