using JoChat.Core.Entities;
using Microsoft.EntityFrameworkCore;
using ScimSlim.EntityFramework;
using ScimSlim.EntityFramework.Entities;

namespace JoChat.Infrastructure.Persistence;

// PostgreSQL only; migrations live under Migrations/Postgres (see AppDbContextFactory).
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
    public DbSet<ChatShare> ChatShares => Set<ChatShare>();
    public DbSet<AdminAuditEntry> AdminAuditEntries => Set<AdminAuditEntry>();

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
            e.HasOne(x => x.Chat).WithMany(c => c.Messages).HasForeignKey(x => x.ChatId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => new { x.ChatId, x.CreatedAt });
        });

        b.Entity<Attachment>(e =>
        {
            e.HasOne(x => x.Message).WithMany(m => m.Attachments).HasForeignKey(x => x.MessageId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        b.Entity<ChatShare>(e =>
        {
            e.HasOne(x => x.Chat).WithMany().HasForeignKey(x => x.ChatId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(x => x.ChatId).IsUnique();
            e.HasIndex(x => x.Token).IsUnique();
        });

        b.Entity<ModelDefinition>(e =>
            e.HasIndex(x => new { x.Provider, x.ModelId }).IsUnique());

        b.Entity<UsageRecord>(e =>
            e.HasIndex(x => new { x.UserId, x.CreatedAt }));

        b.Entity<AdminAuditEntry>(e =>
        {
            e.Property(x => x.Action).HasMaxLength(32);
            e.HasIndex(x => x.CreatedAt);
        });
    }
}