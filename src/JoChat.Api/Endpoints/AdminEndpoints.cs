namespace JoChat.Api.Endpoints;

public static class AdminEndpoints
{
    public static RouteGroupBuilder MapAdminEndpoints(this RouteGroupBuilder group)
    {
        // TODO:
        // GET /admin/models          -> list/manage ModelDefinitions (enable/disable, pricing).
        // GET /admin/usage           -> aggregate UsageRecord stats per user/model.
        // GET /admin/users           -> list provisioned UserProfiles / SCIM sync status.
        return group;
    }
}