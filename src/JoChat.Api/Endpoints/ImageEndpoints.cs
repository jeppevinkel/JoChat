namespace JoChat.Api.Endpoints;

public static class ImageEndpoints
{
    public static RouteGroupBuilder MapImageEndpoints(this RouteGroupBuilder group)
    {
        // TODO:
        // POST /images/generate -> call IImageGenerationProvider (keyed by persona/request provider),
        //                          persist result via IFileStorage as an Attachment, return its id/url.
        return group;
    }
}