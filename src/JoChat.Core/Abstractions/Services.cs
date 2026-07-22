using JoChat.Core.Entities;

namespace JoChat.Core.Abstractions;

public interface ICurrentUserService
{
    /// <summary>Resolves (or lazily creates on first login) the UserProfile for the authenticated principal.</summary>
    Task<UserProfile> GetRequiredUserAsync(CancellationToken ct = default);
}

public interface IGroupMembershipCache
{
    Task<IReadOnlySet<string>> GetGroupNamesForExternalIdAsync(string externalId, CancellationToken ct = default);
}

public interface IFileStorage
{
    Task<string> SaveAsync(Stream content, string mimeType, CancellationToken ct = default);
    Task<Stream> OpenReadAsync(string path, CancellationToken ct = default);
    Task DeleteAsync(string path, CancellationToken ct = default);
}