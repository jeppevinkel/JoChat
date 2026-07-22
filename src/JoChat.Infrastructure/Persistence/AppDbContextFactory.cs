using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace JoChat.Infrastructure.Persistence;

// Used by `dotnet ef migrations add` — selects provider via env vars so migrations
// can be generated for either database without needing a live connection or the full app host.
// Sqlite: dotnet ef migrations add <Name> -o Migrations/Sqlite -p src/JoChat.Infrastructure -s src/JoChat.Api
// MySql:  EF_PROVIDER=MySql dotnet ef migrations add <Name> -o Migrations/MySql -p src/JoChat.Infrastructure -s src/JoChat.Api
//
// IMPORTANT: only keep ONE provider's migration set in this assembly at a time.
// Database.Migrate() applies every Migration-derived class it finds in the assembly
// regardless of which provider generated it, so Sqlite and MySql migrations can't
// coexist here safely. When switching, delete the other provider's Migrations/<X>
// folder before generating the new set (a full-model AppDbContextModelSnapshot from
// the old provider would also need removing/regenerating).
public class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var provider = Environment.GetEnvironmentVariable("EF_PROVIDER") ?? "Sqlite";
        var optionsBuilder = new DbContextOptionsBuilder<AppDbContext>();

        if (string.Equals(provider, "MySql", StringComparison.OrdinalIgnoreCase))
        {
            var cs = Environment.GetEnvironmentVariable("EF_CONNECTION")
                     ?? "Server=localhost;Database=jochat;User=jochat;Password=CHANGE_ME";
            // Fixed version so migration generation doesn't require a live MySQL connection.
            optionsBuilder.UseMySql(cs, new MySqlServerVersion(new Version(8, 0, 36)));
        }
        else
        {
            var cs = Environment.GetEnvironmentVariable("EF_CONNECTION") ?? "Data Source=jochat.dev.db";
            optionsBuilder.UseSqlite(cs);
        }

        return new AppDbContext(optionsBuilder.Options);
    }
}
