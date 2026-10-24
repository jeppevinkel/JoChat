namespace JoChat.Core.Entities;

public class Persona
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public string? Description { get; set; }
    public required string SystemPrompt { get; set; }
    public required string Provider { get; set; }       // "anthropic"
    public required string ModelId { get; set; }        // "claude-sonnet-4-6"
    public double? Temperature { get; set; }
    public int? MaxTokens { get; set; }
    // Provider-hosted tools (see ChatTools); the provider decides what each id maps to.
    public bool EnableWebSearch { get; set; }
    public bool EnableWebFetch { get; set; }
    public bool EnableCodeExecution { get; set; }
    public string? DefaultTtsProvider { get; set; }
    public string? DefaultTtsVoiceId { get; set; }
    public Guid OwnerId { get; set; }
    public UserProfile? Owner { get; set; }
    public bool IsShared { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}