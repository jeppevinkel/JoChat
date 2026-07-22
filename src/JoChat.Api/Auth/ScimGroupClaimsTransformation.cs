using System.Security.Claims;
using JoChat.Core.Abstractions;
using JoChat.Core.Constants;
using JoChat.Core.Options;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using ScimSlim.Abstractions;

namespace JoChat.Api.Auth;

public class ScimGroupClaimsTransformation(
    IScimUserStore userStore,
    IGroupMembershipCache membershipCache,
    IOptions<AuthorizationGroupOptions> groups) : IClaimsTransformation
{
    public async Task<ClaimsPrincipal> TransformAsync(ClaimsPrincipal principal)
    {
        var sub = principal.FindFirst("sub")?.Value;
        if (sub is null || principal.HasClaim(c => c.Type == "jochat:roles-resolved"))
            return principal;

        var groupNames = await membershipCache.GetGroupNamesForExternalIdAsync(sub);

        var identity = new ClaimsIdentity();
        identity.AddClaim(new Claim("jochat:roles-resolved", "true"));

        if (groupNames.Contains(groups.Value.UserGroup))
            identity.AddClaim(new Claim(ClaimTypes.Role, JoChatRoles.User));
        if (groupNames.Contains(groups.Value.SuperAdminGroup))
            identity.AddClaim(new Claim(ClaimTypes.Role, JoChatRoles.SuperAdmin));

        principal.AddIdentity(identity);
        return principal;
    }
}