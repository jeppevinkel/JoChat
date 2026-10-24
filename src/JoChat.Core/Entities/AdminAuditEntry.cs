namespace JoChat.Core.Entities;

/// <summary>
/// A record of an administrator looking at user content: opening a chat transcript or searching
/// message text. Kept independent of the chat and users (no foreign keys, title copied in) so the
/// trail survives the chat being deleted.
/// </summary>
public class AdminAuditEntry
{
    public Guid Id { get; set; }
    public Guid AdminId { get; set; }
    /// <summary>One of <see cref="AdminAuditActions"/>.</summary>
    public required string Action { get; set; }
    /// <summary>Owner of the content looked at, or the user a search was limited to.</summary>
    public Guid? TargetUserId { get; set; }
    public Guid? ChatId { get; set; }
    /// <summary>The chat's title at the time, or the search text.</summary>
    public string? Detail { get; set; }
    public DateTime CreatedAt { get; set; }
}

public static class AdminAuditActions
{
    public const string ViewChat = "view_chat";
    public const string SearchMessages = "search_messages";
}
