using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace JoChat.Infrastructure.Migrations.Sqlite
{
    /// <inheritdoc />
    public partial class ScimUserSoftDelete : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAt",
                table: "ScimUsers",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "ScimUsers",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "ScimUsers");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "ScimUsers");
        }
    }
}
