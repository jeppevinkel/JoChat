namespace JoChat.Core.Entities;

public class Message
{
    public Guid Id { get; set; }
    public Guid ChatId { get; set; }
    public Chat? Chat { get; set; }
    /// <summary>Enables regenerate/edit branching later.</summary>
    public Guid? ParentMessageId { get; set; }
    public Enums.MessageRole Role { get; set; }
    public string Content { get; set; } = string.Empty;
    public int? TokensIn { get; set; }
    public int? TokensOut { get; set; }
    /// <summary>JSON array of ToolStep recorded while the reply streamed; null when no tools ran.</summary>
    public string? ToolActivity { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<Attachment> Attachments { get; set; } = [];
}