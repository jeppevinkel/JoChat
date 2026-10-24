using System.Buffers.Binary;

namespace JoChat.Infrastructure.Storage;

/// <summary>
/// Reads pixel dimensions from PNG, JPEG, GIF and WebP headers without decoding the image.
/// Returns null for anything it doesn't recognise; callers treat dimensions as optional.
/// </summary>
public static class ImageDimensions
{
    public static (int Width, int Height)? TryRead(ReadOnlySpan<byte> data)
    {
        // Note: 0x89 can't be written in a u8 literal (it would encode as UTF-8), hence the byte check.
        if (data.Length >= 24 && data[0] == 0x89 && data[1..8].SequenceEqual("PNG\r\n\x1a\n"u8))
            return ReadPng(data);
        if (data.Length >= 10 && (data[..6].SequenceEqual("GIF87a"u8) || data[..6].SequenceEqual("GIF89a"u8)))
            return (BinaryPrimitives.ReadUInt16LittleEndian(data[6..]), BinaryPrimitives.ReadUInt16LittleEndian(data[8..]));
        if (data.Length >= 4 && data[0] == 0xFF && data[1] == 0xD8)
            return ReadJpeg(data);
        if (data.Length >= 30 && data[..4].SequenceEqual("RIFF"u8) && data[8..12].SequenceEqual("WEBP"u8))
            return ReadWebP(data);
        return null;
    }

    public static async Task<(int Width, int Height)?> TryReadAsync(Stream stream, CancellationToken ct)
    {
        // Headers sit at the front; JPEG SOF markers can follow large EXIF/ICC blocks, so read generously.
        var buffer = new byte[64 * 1024];
        var read = 0;
        while (read < buffer.Length)
        {
            var n = await stream.ReadAsync(buffer.AsMemory(read), ct);
            if (n == 0) break;
            read += n;
        }
        return TryRead(buffer.AsSpan(0, read));
    }

    private static (int, int)? ReadPng(ReadOnlySpan<byte> d)
    {
        // First chunk must be IHDR: length(4) "IHDR"(4) width(4) height(4)
        if (!d[12..16].SequenceEqual("IHDR"u8)) return null;
        return ((int)BinaryPrimitives.ReadUInt32BigEndian(d[16..]), (int)BinaryPrimitives.ReadUInt32BigEndian(d[20..]));
    }

    private static (int, int)? ReadJpeg(ReadOnlySpan<byte> d)
    {
        // Walk marker segments until a start-of-frame (SOFn, excluding DHT/JPG/DAC) is found.
        var i = 2;
        while (i + 9 < d.Length)
        {
            if (d[i] != 0xFF) { i++; continue; }
            var marker = d[i + 1];
            if (marker == 0xFF) { i++; continue; }          // padding
            if (marker is 0xD8 or 0x01 or (>= 0xD0 and <= 0xD7)) { i += 2; continue; } // standalone
            var length = BinaryPrimitives.ReadUInt16BigEndian(d[(i + 2)..]);
            var isSof = marker is >= 0xC0 and <= 0xCF and not (0xC4 or 0xC8 or 0xCC);
            if (isSof)
                return (BinaryPrimitives.ReadUInt16BigEndian(d[(i + 7)..]), BinaryPrimitives.ReadUInt16BigEndian(d[(i + 5)..]));
            if (marker == 0xDA) return null;                 // start of scan: no SOF seen
            i += 2 + length;
        }
        return null;
    }

    private static (int, int)? ReadWebP(ReadOnlySpan<byte> d)
    {
        var chunk = d[12..16];
        if (chunk.SequenceEqual("VP8X"u8) && d.Length >= 30)
        {
            // Extended: 24-bit canvas width-1 / height-1 at offsets 24 and 27
            var w = (d[24] | d[25] << 8 | d[26] << 16) + 1;
            var h = (d[27] | d[28] << 8 | d[29] << 16) + 1;
            return (w, h);
        }
        if (chunk.SequenceEqual("VP8 "u8) && d.Length >= 30)
        {
            // Lossy: after the 3-byte frame tag and 3-byte start code, 14-bit width/height
            if (d[23] != 0x9D || d[24] != 0x01 || d[25] != 0x2A) return null;
            return (BinaryPrimitives.ReadUInt16LittleEndian(d[26..]) & 0x3FFF,
                    BinaryPrimitives.ReadUInt16LittleEndian(d[28..]) & 0x3FFF);
        }
        if (chunk.SequenceEqual("VP8L"u8) && d.Length >= 25)
        {
            // Lossless: signature 0x2F then 14-bit width-1 and height-1 packed little-endian
            if (d[20] != 0x2F) return null;
            var bits = BinaryPrimitives.ReadUInt32LittleEndian(d[21..]);
            return ((int)(bits & 0x3FFF) + 1, (int)((bits >> 14) & 0x3FFF) + 1);
        }
        return null;
    }
}
