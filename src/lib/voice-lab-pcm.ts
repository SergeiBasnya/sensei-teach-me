import { VOICE_LAB } from "../../shared/voice-lab";

export type VoiceLabPcmBuffer = {
  data: ArrayBuffer;
  sampleRate: number;
  channels: number;
  timestamp?: number;
};

/** Bounded PCM16LE conversion; resampling keeps fractional phase across chunks.
 * The fallback averages sample areas when downsampling. It is not a claim that
 * upsampling an 8 kHz microphone restores missing frequencies.
 */
export class VoiceLabPcm {
  private rate = 0;
  private channels = 0;
  private weight = 0;
  private sum = 0;
  private pending: number[] = [];
  private sourceFrames = 0;
  private sourceSamples = 0;
  private clippedSamples = 0;
  private peakValue = 0;
  private squareSum = 0;
  private outputSamples = 0;

  push(input: VoiceLabPcmBuffer): Uint8Array[] {
    const { data, sampleRate, channels } = input;
    if (
      !Number.isInteger(sampleRate) ||
      sampleRate < 8000 ||
      sampleRate > 96000 ||
      !Number.isInteger(channels) ||
      channels < 1 ||
      channels > 2 ||
      !(data instanceof ArrayBuffer) ||
      data.byteLength % (2 * channels) !== 0 ||
      data.byteLength > sampleRate * channels * 2
    )
      throw new Error("invalid_pcm");
    if (this.rate && (this.rate !== sampleRate || this.channels !== channels))
      throw new Error("capture_format_changed");
    this.rate = sampleRate;
    this.channels = channels;
    const view = new DataView(data);
    const ratio = sampleRate / VOICE_LAB.sampleRate;
    const packets: Uint8Array[] = [];
    for (let offset = 0; offset < data.byteLength; offset += channels * 2) {
      let mono = 0;
      for (let channel = 0; channel < channels; channel++) {
        const value = view.getInt16(offset + channel * 2, true);
        mono += value / channels;
        this.peakValue = Math.max(this.peakValue, Math.abs(value) / 32768);
        if (Math.abs(value) >= 32760) this.clippedSamples++;
      }
      this.sourceFrames++;
      this.sourceSamples += channels;
      this.squareSum += (mono / 32768) ** 2;
      let left = 1;
      while (left > 1e-8) {
        const used = Math.min(left, ratio - this.weight);
        this.sum += mono * used;
        this.weight += used;
        left -= used;
        if (this.weight + 1e-8 >= ratio) {
          this.pending.push(
            Math.max(-32768, Math.min(32767, Math.round(this.sum / ratio))),
          );
          this.outputSamples++;
          this.weight = 0;
          this.sum = 0;
          if (this.pending.length >= 1600) packets.push(this.take(1600));
        }
      }
    }
    return packets;
  }
  private take(length: number) {
    const data = new Uint8Array(length * 2);
    const view = new DataView(data.buffer);
    for (let i = 0; i < length; i++)
      view.setInt16(i * 2, this.pending[i]!, true);
    this.pending.splice(0, length);
    return data;
  }
  flush() {
    // Complete the last weighted sample, then send even a short final packet.
    if (this.weight > 1e-8) {
      this.pending.push(
        Math.max(-32768, Math.min(32767, Math.round(this.sum / this.weight))),
      );
      this.outputSamples++;
      this.weight = 0;
      this.sum = 0;
    }
    return this.pending.length ? this.take(this.pending.length) : null;
  }
  snapshot() {
    return {
      sourceRateHz: this.rate,
      sourceChannels: this.channels,
      sourceFrames: this.sourceFrames,
      capturedMs: this.rate
        ? Math.round((this.sourceFrames / this.rate) * 1000)
        : 0,
      outputSamples: this.outputSamples,
      outputRateHz: VOICE_LAB.sampleRate,
      peak: this.peakValue,
      rms: this.sourceFrames
        ? Math.sqrt(this.squareSum / this.sourceFrames)
        : 0,
      clippedFraction: this.sourceSamples
        ? this.clippedSamples / this.sourceSamples
        : 0,
    };
  }
}
export function voiceLabPacket(
  turn: number,
  sequence: number,
  pcm: Uint8Array,
) {
  if (
    !Number.isInteger(turn) ||
    turn < 1 ||
    turn > 0xffffffff ||
    !Number.isInteger(sequence) ||
    sequence < 0 ||
    sequence > 0xffffffff ||
    pcm.byteLength < 2 ||
    pcm.byteLength > VOICE_LAB.maxChunkBytes ||
    pcm.byteLength % 2
  )
    throw new Error("invalid_packet");
  const result = new Uint8Array(VOICE_LAB.frameHeaderBytes + pcm.byteLength);
  const header = new DataView(result.buffer);
  header.setUint32(0, turn, true);
  header.setUint32(4, sequence, true);
  result.set(pcm, VOICE_LAB.frameHeaderBytes);
  return result.buffer;
}
export function pcm16Level(pcm: Uint8Array) {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let square = 0;
  for (let i = 0; i < pcm.byteLength; i += 2)
    square += (view.getInt16(i, true) / 32768) ** 2;
  return Math.sqrt(square / (pcm.byteLength / 2));
}

/** Experimental endpoint policy. A partial is never a correction or mastery event. */
export class VoiceLabEndpoint {
  private lastVoice = 0;
  private voicedMs = 0;
  private audioMs = 0;
  private floor = -70;
  private partial = "";
  private uncertain = true;
  private stable = 0;
  private partialAudioMs = 0;
  constructor(private started: number) {
    this.lastVoice = started;
  }
  notePartial(text: string, uncertain: boolean) {
    const normalized = text.trim().replace(/\s+/g, " ");
    this.stable =
      normalized && normalized === this.partial ? this.stable + 1 : 1;
    this.partial = normalized;
    this.uncertain = uncertain;
    this.partialAudioMs = this.audioMs;
  }
  observe(
    pcm: Uint8Array,
    now: number,
  ): "listen" | "finish" | "quiet" | "limit" {
    const duration = (pcm.byteLength / 2 / VOICE_LAB.sampleRate) * 1000;
    this.audioMs += duration;
    const db = 20 * Math.log10(Math.max(1e-7, pcm16Level(pcm)));
    const threshold = Math.max(-48, Math.min(-28, this.floor + 12));
    if (db > threshold) {
      this.lastVoice = now;
      this.voicedMs += duration;
    } else
      this.floor = Math.max(-85, Math.min(-40, this.floor * 0.98 + db * 0.02));
    if (now - this.started >= VOICE_LAB.maxTurnMs - 250) return "limit";
    if (this.voicedMs < 180)
      return now - this.started >= 20_000 ? "quiet" : "listen";
    return this.canFinish(now) ? "finish" : "listen";
  }
  canFinish(now: number) {
    if (this.voicedMs < 180) return false;
    const ending = this.partial.replace(/[。！？.!?…⋯\s]+$/gu, "");
    const unfinished =
      /(?:ええ?と|えっと|あの|いや|うーん|je|euh|attends|non je|は|が|を|に|で|と|へ|から|まで|の)[、,\s]*$/i.test(
        ending,
      );
    const stable =
      this.stable >= 2 &&
      !this.uncertain &&
      !!this.partial &&
      this.audioMs - this.partialAudioMs >= 100;
    const wait = unfinished ? 5000 : stable ? 1800 : 3200;
    return now - this.lastVoice >= wait;
  }
  get lastDetectedVoiceAt() {
    return this.voicedMs >= 180 ? this.lastVoice : null;
  }
}

export class VoiceLabEpoch {
  private epoch = 0;
  private turn = 0;
  private valid = false;
  begin() {
    this.valid = true;
    return { epoch: ++this.epoch, turn: ++this.turn };
  }
  pause() {
    this.valid = false;
    this.epoch++;
  }
  current(tag: { epoch: number; turn: number }) {
    return this.valid && tag.epoch === this.epoch && tag.turn === this.turn;
  }
  accepts(turn: number) {
    return this.valid && turn === this.turn;
  }
  tag() {
    return { epoch: this.epoch, turn: this.turn };
  }
}
