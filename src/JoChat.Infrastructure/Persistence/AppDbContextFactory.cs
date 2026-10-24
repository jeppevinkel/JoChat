using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace JoChat.Infrastructure.Persistence;

// Used by `dotnet ef migrations add` so migrations can be generated without the full app host:
//   dotnet ef migrations add <Name> -o Migrations/Postgres -p src/JoChat.Infrastructure -s src/JoChat.Api
// Npgsql generates migrations without a live connection; EF_CONNECTION only matters for
// `dotnet ef database update`.
public class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var cs = Environment.GetEnvironmentVariable("EF_CONNECTION")
                 ?? "Host=localhost;Database=jochat;Username=jochat;Password=jochat";
        var optionsBuilder = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(cs);
        return new AppDbContext(optionsBuilder.Options);
    }
}
