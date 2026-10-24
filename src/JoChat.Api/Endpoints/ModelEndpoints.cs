using JoChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JoChat.Api.Endpoints;

public static class ModelEndpoints
{
    public static RouteGroupBuilder MapModelEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/models", async (AppDbContext db, CancellationToken ct) =>
            await db.ModelDefinitions
                .Where(m => m.IsEnabled)
                .OrderBy(m => m.Provider).ThenBy(m => m.DisplayName)
                .Select(m => new { m.Id, m.Provider, m.ModelId, m.DisplayName, m.SupportsVision })
                .ToListAsync(ct));
        return group;
    }
}
