namespace JoChat.Core.Entities;

/// <summary>A read-only link to a chat. One per chat; deleting it revokes the link.</summary>
public class ChatShare
{
    public Guid Id { get; set; }
    public Guid ChatId { get; set; }
    public Chat? Chat { get; set; }
    /// <summary>Unguessable URL token; the only thing a viewer needs.</summary>
    public required string Token { get; set; }
    /// <summary>When false, viewers must be signed-in JoChat users.</summary>
    public bool AllowAnonymous { get; set; }
    public DateTime CreatedAt { get; set; }
}
