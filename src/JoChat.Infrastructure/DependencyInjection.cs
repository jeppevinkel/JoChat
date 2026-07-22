using JoChat.Core.Abstractions;
using JoChat.Infrastructure.Identity;
using JoChat.Infrastructure.Persistence;
using JoChat.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace JoChat.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddJoChatInfrastructure(
        this IServiceCollection services, IConfiguration config)
    {
        var cs = config.GetConnectionString("Default")!;
        var dbProvider = config["Database:Provider"] ?? "MySql";
        services.AddDbContext<AppDbContext>(o =>
        {
            if (string.Equals(dbProvider, "Sqlite", StringComparison.OrdinalIgnoreCase))
                o.UseSqlite(cs);
            else
                o.UseMySql(cs, ServerVersion.AutoDetect(cs));
        });

        services.AddMemoryCache();
        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUserService, CurrentUserService>();
        services.AddSingleton<IGroupMembershipCache, GroupMembershipCache>();
        services.AddSingleton<IFileStorage, LocalDiskFileStorage>();
        return services;
    }
}