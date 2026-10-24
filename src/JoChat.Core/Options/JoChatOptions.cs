namespace JoChat.Core.Options;

public class AuthorizationGroupOptions
{
    public const string Section = "AuthorizationGroups";
    public string UserGroup { get; set; } = "jochat-users";
    public string SuperAdminGroup { get; set; } = "jochat-superadmins";
}

public class OidcOptions
{
    public const string Section = "Oidc";
    public required string Authority { get; set; }
    public required string Audience { get; set; }
}

public class AnthropicOptions
{
    public const string Section = "Anthropic";
    public required string ApiKey { get; set; }
    public string BaseUrl { get; set; } = "https://api.anthropic.com";
}

public class OpenAiOptions
{
    public const string Section = "OpenAi";
    public required string ApiKey { get; set; }
    public string ImageModel { get; set; } = "gpt-image-2";
    public string TtsModel { get; set; } = "gpt-4o-mini-tts";
}

public class ElevenLabsOptions
{
    public const string Section = "ElevenLabs";
    public required string ApiKey { get; set; }
}

public class StorageOptions
{
    public const string Section = "Storage";
    public string RootPath { get; set; } = "data/files";
    public long MaxUploadBytes { get; set; } = 10 * 1024 * 1024;
}