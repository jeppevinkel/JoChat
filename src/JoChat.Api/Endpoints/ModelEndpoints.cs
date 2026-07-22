namespace JoChat.Api.Endpoints;

public static class ModelEndpoints
{
    public static RouteGroupBuilder MapModelEndpoints(this RouteGroupBuilder group)
    {
        // TODO:
        // GET /models -> list enabled ModelDefinitions (id, provider, display name, capabilities)
        //                for populating persona/model pickers in the client.
        return group;
    }
}