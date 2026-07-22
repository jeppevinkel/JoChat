namespace JoChat.Api.Endpoints;

public static class AttachmentEndpoints
{
    public static RouteGroupBuilder MapAttachmentEndpoints(this RouteGroupBuilder group)
    {
        // TODO:
        // POST /attachments        -> upload file via IFileStorage, persist Attachment record, return id.
        // GET /attachments/{id}    -> stream file bytes back (verify ownership), set content-type/kind.
        // DELETE /attachments/{id} -> verify ownership, delete from IFileStorage + Attachment record.
        return group;
    }
}