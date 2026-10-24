using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JoChat.Infrastructure.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class PersonaToolsAndMessageToolActivity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "EnableCodeExecution",
                table: "Personas",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "EnableWebFetch",
                table: "Personas",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "EnableWebSearch",
                table: "Personas",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "ToolActivity",
                table: "Messages",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EnableCodeExecution",
                table: "Personas");

            migrationBuilder.DropColumn(
                name: "EnableWebFetch",
                table: "Personas");

            migrationBuilder.DropColumn(
                name: "EnableWebSearch",
                table: "Personas");

            migrationBuilder.DropColumn(
                name: "ToolActivity",
                table: "Messages");
        }
    }
}
