namespace JoChat.Api.Endpoints;

public static class PersonaEndpoints
{
    public static RouteGroupBuilder MapPersonaEndpoints(this RouteGroupBuilder group)
    {
        // TODO:
        // GET /personas        -> list own + shared (IsShared) personas.
        // POST /personas       -> create persona (owner = current user).
        // PUT /personas/{id}   -> update persona, verify ownership.
        // DELETE /personas/{id} -> delete persona, verify ownership; guard against in-use by existing Chats.
        return group;
    }
}