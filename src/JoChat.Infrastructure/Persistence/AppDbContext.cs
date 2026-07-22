using JoChat.Core.Entities;
using Microsoft.EntityFrameworkCore;
using ScimSlim.EntityFramework;
using ScimSlim.EntityFramework.Entities;

namespace JoChat.Infrastructure.Persistence;

// TODO: no EF Core migrations exist yet — run `dotnet ef migrations add InitialCreate`
// once the model below settles, then apply on startup/deploy.
public class AppDbContext(DbContextOptions<AppDbContext> options)
    : DbContext(options), IScimDbContext
{
    public DbSet<ScimUserEntity> ScimUsers => Set<ScimUserEntity>();
    public DbSet<ScimGroupEntity> ScimGroups => Set<ScimGroupEntity>();

    public DbSet<UserProfile> UserProfiles => Set<UserProfile>();
    public DbSet<Persona> Personas => Set<Persona>();
    public DbSet<Chat> Chats => Set<Chat>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<Attachment> Attachments => Set<Attachment>();
    public DbSet<ModelDefinition> ModelDefinitions => Set<ModelDefinition>();
    public DbSet<UsageRecord> UsageRecords => Set<UsageRecord>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.ApplyScimModel();

        b.Entity<UserProfile>(e =>
        {
            e.HasIndex(x => x.ExternalId).IsUnique();
            e.HasIndex(x => x.ScimUserId).IsUnique();
        });

        b.Entity<Persona>(e =>
        {
            e.Property(x => x.SystemPrompt).HasColumnType("LONGTEXT");
            e.HasOne(x => x.Owner).WithMany().HasForeignKey(x => x.OwnerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Chat>(e =>
        {
            e.HasOne(x => x.Persona).WithMany().HasForeignKey(x => x.PersonaId)
                .OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Owner).WithMany().HasForeignKey(x => x.OwnerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Message>(e =>
        {
            e.Property(x => x.Content).HasColumnType("LONGTEXT");
            e.HasOne(x => x.Chat).WithMany(c => c.Messages).HasForeignKey(x => x.ChatId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.ChatId, x.CreatedAt });
        });

        b.Entity<Attachment>(e =>
        {
            e.HasOne(x => x.Message).WithMany(m => m.Attachments).HasForeignKey(x => x.MessageId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<ModelDefinition>(e =>
            e.HasIndex(x => new { x.Provider, x.ModelId }).IsUnique());

        b.Entity<UsageRecord>(e =>
            e.HasIndex(x => new { x.UserId, x.CreatedAt }));
    }
}