using JoChat.Core.Abstractions;
using JoChat.Core.Entities;
using JoChat.Core.Enums;
using JoChat.Core.Options;
using JoChat.Infrastructure.Persistence;
using JoChat.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace JoChat.Api.Endpoints;

public static class AttachmentEndpoints
{
    private static readonly HashSet<string> AllowedImageTypes =
        new(StringComparer.OrdinalIgnoreCase) { "image/png", "image/jpeg", "image/webp", "image/gif" };

    public static RouteGroupBuilder MapAttachmentEndpoints(this RouteGroupBuilder group)
    {
        group.MapPost("/attachments", async (IFormFile file, AppDbContext db, ICurrentUserService current,
            IFileStorage storage, IOptions<StorageOptions> storageOptions, CancellationToken ct) =>
        {
            var user = await current.GetRequiredUserAsync(ct);

            if (!AllowedImageTypes.Contains(file.ContentType))
                return Results.Problem("Only PNG, JPEG, WebP and GIF images can be uploaded.",
                    statusCode: StatusCodes.Status415UnsupportedMediaType);
            if (file.Length == 0 || file.Length > storageOptions.Value.MaxUploadBytes)
                return Results.Problem($"File must be between 1 byte and {storageOptions.Value.MaxUploadBytes} bytes.",
                    statusCode: StatusCodes.Status413PayloadTooLarge);

            (int Width, int Height)? dimensions;
            await using (var probe = file.OpenReadStream())
                dimensions = await ImageDimensions.TryReadAsync(probe, ct);
            if (dimensions is null)
                return Results.Problem("File is not a recognisable image.", statusCode: StatusCodes.Status415UnsupportedMediaType);

            await using var stream = file.OpenReadStream();
            var path = await storage.SaveAsync(stream, file.ContentType.ToLowerInvariant(), ct);

            var attachment = new Attachment
            {
                Id = Guid.NewGuid(),
                OwnerId = user.Id,
                Kind = AttachmentKind.UploadedImage,
                StoragePath = path,
                MimeType = file.ContentType.ToLowerInvariant(),
                SizeBytes = file.Length,
                Width = dimensions.Value.Width,
                Height = dimensions.Value.Height,
                CreatedAt = DateTime.UtcNow,
            };
            db.Attachments.Add(attachment);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/attachments/{attachment.Id}",
                new { attachment.Id, attachment.MimeType, attachment.SizeBytes });
        }).DisableAntiforgery() // bearer-token API; no cookie session to forge
          .RequireRateLimiting(RatePolicies.Upload);

        group.MapGet("/attachments/{id:guid}", async (Guid id, AppDbContext db,
            ICurrentUserService current, IFileStorage storage, CancellationToken ct) =>
        {
            var user = await current.GetRequiredUserAsync(ct);
            var attachment = await db.Attachments
                .FirstOrDefaultAsync(a => a.Id == id && a.OwnerId == user.Id, ct);
            if (attachment is null) return Results.NotFound();

            var stream = await storage.OpenReadAsync(attachment.StoragePath, ct);
            return Results.File(stream, attachment.MimeType, enableRangeProcessing: true);
        });

        group.MapDelete("/attachments/{id:guid}", async (Guid id, AppDbContext db,
            ICurrentUserService current, IFileStorage storage, CancellationToken ct) =>
        {
            var user = await current.GetRequiredUserAsync(ct);
            var attachment = await db.Attachments
                .FirstOrDefaultAsync(a => a.Id == id && a.OwnerId == user.Id, ct);
            if (attachment is null) return Results.NotFound();

            // Once linked to a message it's part of the conversation history; delete the chat instead.
            if (attachment.MessageId is not null)
                return Results.Problem("Attachment is part of a message.", statusCode: StatusCodes.Status409Conflict);

            db.Attachments.Remove(attachment);
            await db.SaveChangesAsync(ct);
            await storage.DeleteAsync(attachment.StoragePath, ct);
            return Results.NoContent();
        });
        return group;
    }
}
