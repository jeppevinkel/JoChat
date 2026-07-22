namespace JoChat.Core.Entities;

public class ModelDefinition
{
    public Guid Id { get; set; }
    public required string Provider { get; set; }
    public required string ModelId { get; set; }
    public required string DisplayName { get; set; }
    public bool SupportsVision { get; set; }
    public bool IsEnabled { get; set; } = true;
}