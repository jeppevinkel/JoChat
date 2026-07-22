namespace JoChat.Api.Endpoints;

public static class MeEndpoints
{
    public static RouteGroupBuilder MapMeEndpoints(this RouteGroupBuilder group)
    {
        // TODO:
        // GET /me       -> current UserProfile (display name, roles/groups, provisioning state).
        // PATCH /me      -> update user-editable prefs (default persona/model, etc.).
        return group;
    }
}