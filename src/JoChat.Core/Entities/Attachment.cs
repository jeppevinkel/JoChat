namespace JoChat.Core.Entities;

public class Attachment
{
    public Guid Id { get; set; }
    public Guid? MessageId { get; set; }
    public Message? Message { get; set; }
    public Guid OwnerId { get; set; }
    public Enums.AttachmentKind Kind { get; set; }
    public required string StoragePath { get; set; }
    public required string MimeType { get; set; }
    public long SizeBytes { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }
    public DateTime CreatedAt { get; set; }
}