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
    /// <summary>
    /// Provider-native content of an assistant turn (tool calls, results, thinking) so later turns
    /// replay exactly what happened instead of just the text; cleared when the text is edited.
    /// </summary>
    public string? ProviderContent { get; set; }
    public string? ProviderContentFormat { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<Attachment> Attachments { get; set; } = [];
}