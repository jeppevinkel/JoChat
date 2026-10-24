namespace JoChat.Api.Services;

public static class ChatTitles
{
    public const string Default = "New chat";
    private const int MaxLength = 60;

    /// <summary>First line of the first message, trimmed to a sidebar-friendly length.</summary>
    public static string Derive(string text)
    {
        var firstLine = text.Trim().Split('\n', 2)[0].Trim();
        if (firstLine.Length == 0) return Default;
        return firstLine.Length <= MaxLength ? firstLine : firstLine[..MaxLength].TrimEnd() + "…";
    }
}
