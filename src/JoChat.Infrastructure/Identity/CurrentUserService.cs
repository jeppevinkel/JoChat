using System.Security.Claims;
using JoChat.Core.Abstractions;
using JoChat.Core.Entities;
using JoChat.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace JoChat.Infrastructure.Identity;

public class CurrentUserService(IHttpContextAccessor httpContextAccessor, AppDbContext db)
    : ICurrentUserService
{
    private static readonly TimeSpan LastSeenResolution = TimeSpan.FromMinutes(5);
    private UserProfile? _cached;

    public async Task<UserProfile> GetRequiredUserAsync(CancellationToken ct = default)
    {
        if (_cached is not null) return _cached;

        var principal = httpContextAccessor.HttpContext?.User
                        ?? throw new InvalidOperationException("No HTTP context.");
        var sub = principal.FindFirstValue("sub")
                  ?? principal.FindFirstValue(ClaimTypes.NameIdentifier)
                  ?? throw new UnauthorizedAccessException("Missing sub claim.");

        var profile = await db.UserProfiles.FirstOrDefaultAsync(u => u.ExternalId == sub, ct);
        if (profile is null)
        {
            // First login: user was provisioned via SCIM but has no profile yet.
            var scimUser = await db.ScimUsers.FirstOrDefaultAsync(u => u.ExternalId == sub, ct)
                           ?? throw new UnauthorizedAccessException("User not provisioned via SCIM.");

            profile = new UserProfile
            {
                Id = Guid.NewGuid(),
                ScimUserId = scimUser.Id,
                ExternalId = sub,
                DisplayName = principal.FindFirstValue("name"),
                CreatedAt = DateTime.UtcNow,
            };
            db.UserProfiles.Add(profile);
            await db.SaveChangesAsync(ct);
        }

        // Coarse "last seen" without a write per request.
        var now = DateTime.UtcNow;
        if (profile.LastSeenAt is null || now - profile.LastSeenAt.Value > LastSeenResolution)
        {
            profile.LastSeenAt = now;
            await db.SaveChangesAsync(ct);
        }

        return _cached = profile;
    }
}