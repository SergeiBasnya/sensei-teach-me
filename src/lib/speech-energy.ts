export type SpeechEnergy = { step: number; duration: number; levels: number[] };

// PCM seulement : une sortie inconnue garde l’animation de secours du lecteur.
export function speechEnergyFromWav(base64: string): SpeechEnergy | null {
  if (base64.length > 4_000_000 || base64.length % 4 !== 0) return null;
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const bytes = new Uint8Array((base64.length / 4) * 3 - padding);
  let write = 0;
  for (let i = 0; i < base64.length; i += 4) {
    const a = alphabet.indexOf(base64[i]!);
    const b = alphabet.indexOf(base64[i + 1]!);
    const c = base64[i + 2] === "=" ? 0 : alphabet.indexOf(base64[i + 2]!);
    const d = base64[i + 3] === "=" ? 0 : alphabet.indexOf(base64[i + 3]!);
    if (Math.min(a, b, c, d) < 0) return null;
    const value = (a << 18) | (b << 12) | (c << 6) | d;
    if (write < bytes.length) bytes[write++] = (value >> 16) & 255;
    if (write < bytes.length) bytes[write++] = (value >> 8) & 255;
    if (write < bytes.length) bytes[write++] = value & 255;
  }
  if (bytes.length < 44) return null;
  const tag = (offset: number) =>
    String.fromCharCode(...bytes.slice(offset, offset + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  const data = new DataView(bytes.buffer);
  let channels = 0,
    rate = 0,
    offset = 0,
    length = 0;
  for (let i = 12; i + 8 <= bytes.length;) {
    const size = data.getUint32(i + 4, true);
    if (i + 8 + size > bytes.length) return null;
    if (tag(i) === "fmt ") {
      if (
        size < 16 ||
        data.getUint16(i + 8, true) !== 1 ||
        data.getUint16(i + 22, true) !== 16
      )
        return null;
      channels = data.getUint16(i + 10, true);
      rate = data.getUint32(i + 12, true);
    }
    if (tag(i) === "data") {
      offset = i + 8;
      length = size;
    }
    i += 8 + size + (size % 2);
  }
  if (!offset || channels < 1 || channels > 8 || rate < 8000 || rate > 96000)
    return null;
  const frames = Math.floor(length / (channels * 2));
  const hop = Math.max(1, Math.round(rate * 0.08));
  const raw: number[] = [];
  let peak = 0;
  for (let start = 0; start < frames; start += hop) {
    let sum = 0,
      count = 0;
    for (let i = start; i < Math.min(start + hop, frames); i += 4) {
      for (let channel = 0; channel < channels; channel++) {
        const sample =
          data.getInt16(offset + (i * channels + channel) * 2, true) / 32768;
        sum += sample * sample;
        count++;
      }
    }
    const rms = Math.sqrt(sum / Math.max(1, count));
    raw.push(rms);
    peak = Math.max(peak, rms);
  }
  return {
    step: hop / rate,
    duration: frames / rate,
    levels: raw.map((level) =>
      level < 0.003 || !peak ? 0 : Math.round((level / peak) * 100) / 100,
    ),
  };
}
export function mouthLevelAt(energy: SpeechEnergy, seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds >= energy.duration)
    return 0;
  const value = energy.levels[Math.floor(seconds / energy.step)] || 0;
  return value < 0.08 ? 0 : value < 0.45 ? 1 : value < 0.8 ? 2 : 3;
}
