/** Duration of a complete PCM/float WAV, used only as a server-side playback estimate. */
export function wavDurationMs(audio: Buffer): number | undefined {
  if (
    audio.length < 44 ||
    audio.toString("ascii", 0, 4) !== "RIFF" ||
    audio.toString("ascii", 8, 12) !== "WAVE"
  )
    return;
  if (audio.readUInt32LE(4) + 8 > audio.length) return;
  let byteRate = 0,
    dataBytes = 0;
  for (let offset = 12; offset + 8 <= audio.length;) {
    const size = audio.readUInt32LE(offset + 4),
      end = offset + 8 + size;
    if (end > audio.length) return;
    const kind = audio.toString("ascii", offset, offset + 4);
    if (kind === "fmt ") {
      if (size < 16 || ![1, 3].includes(audio.readUInt16LE(offset + 8))) return;
      const channels = audio.readUInt16LE(offset + 10),
        rate = audio.readUInt32LE(offset + 12),
        bits = audio.readUInt16LE(offset + 22);
      byteRate = audio.readUInt32LE(offset + 16);
      if (
        !channels ||
        !rate ||
        !bits ||
        byteRate !== (rate * channels * bits) / 8
      )
        return;
    }
    if (kind === "data") dataBytes += size;
    offset = end + (size % 2);
  }
  const value = (dataBytes / byteRate) * 1000;
  return Number.isFinite(value) && value > 0 && value <= 120_000
    ? value
    : undefined;
}
