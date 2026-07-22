namespace JoChat.Core.Entities;

public class UsageRecord
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public required string Provider { get; set; }
    public required string ModelOrVoiceId { get; set; }
    public string Kind { get; set; } = "chat"; // chat | image | tts
    public int? TokensIn { get; set; }
    public int? TokensOut { get; set; }
    public int? Units { get; set; }            // images generated / tts characters
    public DateTime CreatedAt { get; set; }
}