namespace JoChat.Api;

/// <summary>Names of the rate limiting policies registered in Program.cs.</summary>
public static class RatePolicies
{
    public const string Chat = "chat";
    public const string Image = "image";
    public const string Tts = "tts";
    public const string Upload = "upload";
}
