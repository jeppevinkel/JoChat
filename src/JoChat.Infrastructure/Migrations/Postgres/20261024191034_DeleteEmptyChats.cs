using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JoChat.Infrastructure.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class DeleteEmptyChats : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Chats used to be created before their first message and deleted by the client when left
            // unused, which didn't happen on a closed tab or a crash. Chats are now created together
            // with their first message, so this one-off sweep removes the leftovers. Message-less chats
            // have no attachments (those hang off messages); share rows go with them via the cascade.
            migrationBuilder.Sql("""
                DELETE FROM "Chats" c
                WHERE NOT EXISTS (SELECT 1 FROM "Messages" m WHERE m."ChatId" = c."Id");
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Deleted empty chats carry no data worth restoring.
        }
    }
}
