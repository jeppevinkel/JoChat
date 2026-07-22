namespace JoChat.Api.Endpoints;

public static class TtsEndpoints
{
    public static RouteGroupBuilder MapTtsEndpoints(this RouteGroupBuilder group)
    {
        // TODO:
        // GET /tts/voices  -> ITtsProvider.GetVoicesAsync (keyed by provider) for voice picker.
        // POST /tts/speak  -> ITtsProvider.SynthesizeAsync, persist/stream audio back.
        return group;
    }
}