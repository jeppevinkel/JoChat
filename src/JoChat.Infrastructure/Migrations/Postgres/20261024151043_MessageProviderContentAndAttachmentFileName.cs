using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JoChat.Infrastructure.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class MessageProviderContentAndAttachmentFileName : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ProviderContent",
                table: "Messages",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProviderContentFormat",
                table: "Messages",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FileName",
                table: "Attachments",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ProviderContent",
                table: "Messages");

            migrationBuilder.DropColumn(
                name: "ProviderContentFormat",
                table: "Messages");

            migrationBuilder.DropColumn(
                name: "FileName",
                table: "Attachments");
        }
    }
}
