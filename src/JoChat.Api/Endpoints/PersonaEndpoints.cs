using JoChat.Core.Abstractions;
using JoChat.Core.Entities;
using JoChat.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace JoChat.Api.Endpoints;

public static class PersonaEndpoints
{
    public static RouteGroupBuilder MapPersonaEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/personas", async (AppDbContext db, ICurrentUserService current, CancellationToken ct) =>
        {
            var user = await current.GetRequiredUserAsync(ct);
            return await db.Personas
                .Where(p => p.OwnerId == user.Id || p.IsShared)
                .OrderBy(p => p.Name)
                .Select(p => ToDto(p, user.Id))
                .ToListAsync(ct);
        });

        group.MapGet("/personas/{id:guid}", async (Guid id, AppDbContext db,
            ICurrentUserService current, CancellationToken ct) =>
        {
            var user = await current.GetRequiredUserAsync(ct);
            var persona = await db.Personas
                .FirstOrDefaultAsync(p => p.Id == id && (p.OwnerId == user.Id || p.IsShared), ct);
            return persona is null ? Results.NotFound() : Results.Ok(ToDto(persona, user.Id));
        });

        group.MapPost("/personas", async (PersonaRequest req, AppDbContext db,
            ICurrentUserService current, CancellationToken ct) =>
        {
            var user = await current.GetRequiredUserAsync(ct);
            if (await ValidateAsync(req, db, ct) is { } problem) return problem;

            var persona = new Persona
            {
                Id = Guid.NewGuid(),
                Name = req.Name.Trim(),
                Description = req.Description,
                SystemPrompt = req.SystemPrompt,
                Provider = req.Provider,
                ModelId = req.ModelId,
                Temperature = req.Temperature,
                MaxTokens = req.MaxTokens,
                DefaultTtsProvider = req.DefaultTtsProvider,
                DefaultTtsVoiceId = req.DefaultTtsVoiceId,
                IsShared = req.IsShared,
                OwnerId = user.Id,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            };
            db.Personas.Add(persona);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/personas/{persona.Id}", ToDto(persona, user.Id));
        });

        group.MapPut("/personas/{id:guid}", async (Guid id, PersonaRequest req, AppDbContext db,
            ICurrentUserService current, CancellationToken ct) =>
        {
            var user = await current.GetRequiredUserAsync(ct);
            var persona = await db.Personas.FirstOrDefaultAsync(p => p.Id == id && p.OwnerId == user.Id, ct);
            if (persona is null) return Results.NotFound();
            if (await ValidateAsync(req, db, ct) is { } problem) return problem;

            persona.Name = req.Name.Trim();
            persona.Description = req.Description;
            persona.SystemPrompt = req.SystemPrompt;
            persona.Provider = req.Provider;
            persona.ModelId = req.ModelId;
            persona.Temperature = req.Temperature;
            persona.MaxTokens = req.MaxTokens;
            persona.DefaultTtsProvider = req.DefaultTtsProvider;
            persona.DefaultTtsVoiceId = req.DefaultTtsVoiceId;
            persona.IsShared = req.IsShared;
            persona.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDto(persona, user.Id));
        });

        group.MapDelete("/personas/{id:guid}", async (Guid id, AppDbContext db,
            ICurrentUserService current, CancellationToken ct) =>
        {
            var user = await current.GetRequiredUserAsync(ct);
            var persona = await db.Personas.FirstOrDefaultAsync(p => p.Id == id && p.OwnerId == user.Id, ct);
            if (persona is null) return Results.NotFound();

            // Chats reference personas with Restrict, so refuse rather than fail on the FK.
            if (await db.Chats.AnyAsync(c => c.PersonaId == id, ct))
                return Results.Problem("Persona is in use by existing chats.",
                    statusCode: StatusCodes.Status409Conflict);

            db.Personas.Remove(persona);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });
        return group;
    }

    private static async Task<IResult?> ValidateAsync(PersonaRequest req, AppDbContext db, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return Results.Problem("Name is required.", statusCode: StatusCodes.Status400BadRequest);
        if (req.MaxTokens is <= 0)
            return Results.Problem("MaxTokens must be positive.", statusCode: StatusCodes.Status400BadRequest);

        var modelEnabled = await db.ModelDefinitions
            .AnyAsync(m => m.Provider == req.Provider && m.ModelId == req.ModelId && m.IsEnabled, ct);
        return modelEnabled
            ? null
            : Results.Problem($"Model '{req.Provider}/{req.ModelId}' is not available.",
                statusCode: StatusCodes.Status400BadRequest);
    }

    private static PersonaDto ToDto(Persona p, Guid currentUserId) => new(
        p.Id, p.Name, p.Description, p.SystemPrompt, p.Provider, p.ModelId, p.Temperature, p.MaxTokens,
        p.DefaultTtsProvider, p.DefaultTtsVoiceId, p.IsShared, p.OwnerId == currentUserId, p.UpdatedAt);
}

public record PersonaRequest(
    string Name,
    string? Description,
    string SystemPrompt,
    string Provider,
    string ModelId,
    double? Temperature,
    int? MaxTokens,
    string? DefaultTtsProvider,
    string? DefaultTtsVoiceId,
    bool IsShared);

public record PersonaDto(
    Guid Id,
    string Name,
    string? Description,
    string SystemPrompt,
    string Provider,
    string ModelId,
    double? Temperature,
    int? MaxTokens,
    string? DefaultTtsProvider,
    string? DefaultTtsVoiceId,
    bool IsShared,
    bool IsOwner,
    DateTime UpdatedAt);
