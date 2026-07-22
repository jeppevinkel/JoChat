namespace JoChat.Core.Entities;

public class UserProfile
{
    public Guid Id { get; set; }
    /// <summary>FK to ScimSlim's ScimUserEntity (created by Authentik provisioning).</summary>
    public required string ScimUserId { get; set; }
    /// <summary>Authentik OIDC sub == SCIM externalId. Denormalized for fast lookup.</summary>
    public required string ExternalId { get; set; }
    public string? DisplayName { get; set; }
    public Guid? DefaultPersonaId { get; set; }
    public DateTime CreatedAt { get; set; }
}