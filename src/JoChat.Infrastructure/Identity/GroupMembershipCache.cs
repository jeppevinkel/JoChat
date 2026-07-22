using JoChat.Core.Abstractions;
using JoChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;

namespace JoChat.Infrastructure.Identity;

public class GroupMembershipCache(IServiceScopeFactory scopeFactory, IMemoryCache cache)
    : IGroupMembershipCache
{
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(60);

    public async Task<IReadOnlySet<string>> GetGroupNamesForExternalIdAsync(
        string externalId, CancellationToken ct = default)
    {
        return (await cache.GetOrCreateAsync($"groups:{externalId}", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = Ttl;
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            // Resolve the SCIM user id from the OIDC sub (== SCIM externalId).
            var scimUserId = await db.ScimUsers
                .Where(u => u.ExternalId == externalId)
                .Select(u => u.Id)
                .FirstOrDefaultAsync(ct);

            if (scimUserId is null)
                return new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // Member.Value holds the user's SCIM resource Id.
            var names = await db.ScimGroups
                .Where(g => g.Members.Any(m => m.Value == scimUserId))
                .Select(g => g.DisplayName)
                .ToListAsync(ct);

            return names.ToHashSet(StringComparer.OrdinalIgnoreCase);
        }))!;
    }
}