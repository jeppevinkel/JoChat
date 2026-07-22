using JoChat.Core.Abstractions;
using JoChat.Core.Options;
using Microsoft.Extensions.Options;

namespace JoChat.Infrastructure.Storage;

public class LocalDiskFileStorage(IOptions<StorageOptions> options) : IFileStorage
{
    private readonly string _root = Path.GetFullPath(options.Value.RootPath);

    public async Task<string> SaveAsync(Stream content, string mimeType, CancellationToken ct = default)
    {
        var ext = mimeType switch
        {
            "image/png" => ".png", "image/jpeg" => ".jpg", "image/webp" => ".webp",
            "image/gif" => ".gif", "audio/mpeg" => ".mp3", "audio/wav" => ".wav",
            _ => ".bin",
        };
        var relative = Path.Combine(DateTime.UtcNow.ToString("yyyy/MM"), $"{Guid.NewGuid():N}{ext}");
        var full = Path.Combine(_root, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        await using var fs = File.Create(full);
        await content.CopyToAsync(fs, ct);
        return relative;
    }

    public Task<Stream> OpenReadAsync(string path, CancellationToken ct = default)
    {
        var full = Path.GetFullPath(Path.Combine(_root, path));
        if (!full.StartsWith(_root)) throw new UnauthorizedAccessException(); // path traversal guard
        return Task.FromResult<Stream>(File.OpenRead(full));
    }

    public Task DeleteAsync(string path, CancellationToken ct = default)
    {
        var full = Path.GetFullPath(Path.Combine(_root, path));
        if (full.StartsWith(_root) && File.Exists(full)) File.Delete(full);
        return Task.CompletedTask;
    }
}