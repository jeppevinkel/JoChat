namespace JoChat.Core.Entities;

public class Chat
{
    public Guid Id { get; set; }
    public required string Title { get; set; }
    public Guid PersonaId { get; set; }
    public Persona? Persona { get; set; }
    public Guid OwnerId { get; set; }
    public UserProfile? Owner { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public List<Message> Messages { get; set; } = [];
}