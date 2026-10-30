import test from "node:test";
import assert from "node:assert/strict";
import {
  VoiceLabPcm,
  VoiceLabEndpoint,
  VoiceLabEpoch,
  voiceLabPacket,
} from "../src/lib/voice-lab-pcm";
import { VoiceLabMetrics } from "../src/lib/voice-lab-metrics";

function pcm(samples: number, value: number) {
  const data = new Uint8Array(samples * 2);
  const view = new DataView(data.buffer);
  for (let i = 0; i < samples; i++) view.setInt16(i * 2, value, true);
  return data;
}
function join(values: Uint8Array[]) {
  const result = new Uint8Array(
    values.reduce((sum, value) => sum + value.length, 0),
  );
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.length;
  }
  return result;
}
const voice = pcm(1600, 4000),
  silence = pcm(1600, 0);

test("PCM16 direct garde tous les échantillons et la queue courte", () => {
  const converter = new VoiceLabPcm();
  const input = pcm(2000, -32000);
  const chunks = converter.push({
    data: input.buffer,
    sampleRate: 16000,
    channels: 1,
  });
  const tail = converter.flush();
  assert.ok(tail);
  chunks.push(tail);
  assert.deepEqual(join(chunks), input);
  assert.equal(chunks[0]!.length, 3200);
  assert.equal(tail.length, 800);
  assert.equal(converter.snapshot().capturedMs, 125);
  assert.equal(converter.flush(), null);
});
test("rééchantillonnage garde sa phase malgré les frontières de buffers", () => {
  const input = new Int16Array(44100);
  for (let i = 0; i < input.length; i++)
    input[i] = Math.round(Math.sin((i / 44100) * 2 * Math.PI * 1000) * 14000);
  const whole = new VoiceLabPcm(),
    split = new VoiceLabPcm();
  const a = whole.push({ data: input.buffer, sampleRate: 44100, channels: 1 });
  const aTail = whole.flush();
  if (aTail) a.push(aTail);
  const b: Uint8Array[] = [];
  for (let i = 0; i < input.length; i += 441)
    b.push(
      ...split.push({
        data: input.slice(i, i + 441).buffer,
        sampleRate: 44100,
        channels: 1,
      }),
    );
  const bTail = split.flush();
  if (bTail) b.push(bTail);
  assert.deepEqual(join(a), join(b));
  assert.equal(join(a).length, 32000);
  assert.equal(split.snapshot().sourceRateHz, 44100);
  assert.equal(split.snapshot().capturedMs, 1000);
});
test("canaux réels sont moyennés et un changement de format est refusé", () => {
  const input = new Int16Array(3200);
  for (let i = 0; i < 1600; i++) {
    input[i * 2] = 12000;
    input[i * 2 + 1] = -12000;
  }
  const converter = new VoiceLabPcm();
  const out = converter.push({
    data: input.buffer,
    sampleRate: 16000,
    channels: 2,
  });
  assert.deepEqual(join(out), silence);
  assert.equal(converter.snapshot().sourceChannels, 2);
  assert.equal(converter.snapshot().rms, 0);
  assert.throws(
    () =>
      converter.push({ data: voice.buffer, sampleRate: 48000, channels: 1 }),
    /format_changed/,
  );
  assert.throws(
    () =>
      new VoiceLabPcm().push({
        data: new ArrayBuffer(3),
        sampleRate: 16000,
        channels: 1,
      }),
    /invalid_pcm/,
  );
});
test("paquets ont un en-tête little-endian et une taille bornée", () => {
  const data = voiceLabPacket(0x10203, 5, voice);
  const view = new DataView(data);
  assert.equal(view.getUint32(0, true), 0x10203);
  assert.equal(view.getUint32(4, true), 5);
  assert.equal(data.byteLength, 3208);
  assert.throws(
    () => voiceLabPacket(1, 0, new Uint8Array(6402)),
    /invalid_packet/,
  );
  assert.throws(
    () => voiceLabPacket(1, 0, new Uint8Array(3)),
    /invalid_packet/,
  );
});
test("deux partiels stables plus du PCM autorisent la borne conservée de 1,8 s", () => {
  const endpoint = new VoiceLabEndpoint(0);
  endpoint.observe(voice, 100);
  endpoint.notePartial("はい。", false);
  endpoint.observe(voice, 200);
  endpoint.notePartial("はい。", false);
  for (let t = 300; t < 2000; t += 100)
    assert.equal(endpoint.observe(silence, t), "listen");
  assert.equal(endpoint.observe(silence, 2000), "finish");
});
test("une reconnaissance non stabilisée laisse 3,2 s de silence", () => {
  const endpoint = new VoiceLabEndpoint(0);
  endpoint.observe(voice, 100);
  endpoint.observe(voice, 200);
  endpoint.notePartial("フランスです", true);
  for (let t = 300; t < 3400; t += 100)
    assert.equal(endpoint.observe(silence, t), "listen");
  assert.equal(endpoint.observe(silence, 3400), "finish");
});
test("hésitation et particule finale gardent une marge de 5 s", () => {
  for (const text of ["ええと", "フランスから", "いや"]) {
    const endpoint = new VoiceLabEndpoint(0);
    endpoint.observe(voice, 100);
    endpoint.observe(voice, 200);
    endpoint.notePartial(text, false);
    endpoint.notePartial(text, false);
    for (let t = 300; t < 5200; t += 100)
      assert.equal(endpoint.observe(silence, t), "listen");
    assert.equal(endpoint.observe(silence, 5200), "finish");
  }
});
test("la reprise pendant les 150 ms de marge annule la fin automatique", () => {
  const endpoint = new VoiceLabEndpoint(0);
  endpoint.observe(voice, 100);
  endpoint.notePartial("はい。", false);
  endpoint.observe(voice, 200);
  endpoint.notePartial("はい。", false);
  for (let t = 300; t < 2000; t += 100) endpoint.observe(silence, t);
  assert.equal(endpoint.observe(silence, 2000), "finish");
  endpoint.observe(voice, 2100);
  assert.equal(endpoint.canFinish(2150), false);
  assert.equal(endpoint.lastDetectedVoiceAt, 2100);
});
test("silence et limite restent bornés sans inventer une réponse", () => {
  const quiet = new VoiceLabEndpoint(0);
  assert.equal(quiet.observe(silence, 20_000), "quiet");
  const limit = new VoiceLabEndpoint(0);
  assert.equal(limit.observe(voice, 44_750), "limit");
});
test("pause et reprise invalident les prises et les lectures précédentes", async () => {
  const gate = new VoiceLabEpoch();
  const first = gate.begin();
  let complete: (value: boolean) => void = () => {};
  const pending = new Promise<boolean>((resolve) => {
    complete = resolve;
  }).then((value) => gate.current(first) && value);
  gate.pause();
  assert.equal(gate.accepts(first.turn), false);
  const next = gate.begin();
  complete(true);
  assert.equal(await pending, false);
  assert.equal(gate.current(next), true);
  assert.equal(next.turn, first.turn + 1);
});
test("bilan du laboratoire exclut audio, textes, identifiants et métriques arbitraires", () => {
  const metrics = new VoiceLabMetrics(0);
  metrics.begin(100);
  metrics.chunk(3200);
  metrics.partial(500);
  metrics.finish(1000, 2000);
  metrics.final(true, 2500);
  metrics.playing(3000);
  metrics.server({
    asr: 100,
    first_token: 50,
    stream_complete: 150,
    json_gate_wait: 100,
    sample_save: 12,
    personal_name: 1,
  });
  const result = metrics.report("android", 4000);
  const json = JSON.stringify(result);
  assert.equal(result.humanValidation, "pending");
  assert.equal(result.bargeInEnabled, false);
  assert.equal(result.turns[0]?.firstJapaneseAfterFinishMs, 1000);
  assert.equal(result.turns[0]?.firstJapaneseAfterDetectedVoiceMs, 2000);
  assert.equal(result.turns[0]?.server?.personal_name, undefined);
  assert.equal(result.turns[0]?.server?.sample_save, 12);
  for (const forbidden of [
    '"audio"',
    '"text"',
    '"ticket"',
    '"id"',
    '"transcript"',
  ])
    assert.equal(json.includes(forbidden), false);
  for (let i = 0; i < 130; i++) {
    metrics.begin(5000 + i);
    metrics.server({ asr: 1 });
  }
  assert.equal(metrics.report("android").turns.length, 120);
});

test("la ponctuation ajoutée par une transcription ne termine pas une hésitation", () => {
  for (const text of ["あの。", "えっと。", "えっと…", "フランスから。"]) {
    const endpoint = new VoiceLabEndpoint(0);
    endpoint.observe(voice, 100);
    endpoint.notePartial(text, false);
    endpoint.observe(voice, 200);
    endpoint.notePartial(text, false);
    for (let t = 300; t <= 2300; t += 100)
      assert.equal(endpoint.observe(silence, t), "listen", text);
    assert.equal(endpoint.canFinish(5100), false, text);
    assert.equal(endpoint.canFinish(5200), true, text);
  }
});

test("le délai de reprise ne compte que la réouverture automatique après le dernier segment", () => {
  const metrics = new VoiceLabMetrics(0);
  metrics.begin(100);
  metrics.finish(800, 1000);
  metrics.playbackEnded(1300); // No observed playback: ignore.
  metrics.playing(1500);
  metrics.playbackEnded(2000);
  metrics.playbackEnded(2400); // Last Japanese segment, not first segment.
  metrics.responseDone(2300);
  metrics.begin(2600, true);
  const turn = metrics.report("android", 2700).turns[0]!;
  assert.equal(turn.captureWallMs, 900);
  assert.equal(turn.lastJapaneseEndedAfterFinishMs, 1400);
  assert.equal(turn.responseDoneAfterFinishMs, 1300);
  assert.equal(turn.nextCaptureAfterJapaneseEndedMs, 200);
  metrics.finish(null, 3000);
  metrics.playing(3200);
  metrics.playbackEnded(3500);
  metrics.begin(10000); // Manual pause duration must not become a latency claim.
  assert.equal(
    metrics.report("android").turns[1]!.nextCaptureAfterJapaneseEndedMs,
    undefined,
  );
});
test("l’observateur de lecture est lié à sa source et ne survit pas à une pause", async () => {
  const { onceCurrentPlayback } = await import("../src/lib/voice-lab-playback");
  let generation = 1,
    observed = 0;
  const old = onceCurrentPlayback(
    () => generation === 1,
    () => {
      observed++;
    },
  );
  generation = 2;
  old();
  assert.equal(observed, 0);
  const current = onceCurrentPlayback(
    () => generation === 2,
    () => {
      observed++;
    },
  );
  current();
  current();
  assert.equal(observed, 1);
  const faulty = onceCurrentPlayback(
    () => true,
    () => {
      throw new Error("diagnostic callback");
    },
  );
  assert.doesNotThrow(faulty);
});

test("le worklet borne les messages non acquittés et ne renvoie pas le micro aux haut-parleurs", async () => {
  const { runInNewContext } = await import("node:vm");
  const { voiceLabWorkletSource } =
    await import("../src/lib/voice-lab-worklet");
  type Processor = {
    port: { onmessage: (event: { data: unknown }) => void };
    process: (input: Float32Array[][], output: Float32Array[][]) => boolean;
  };
  let Factory: (new () => Processor) | undefined;
  const messages: unknown[] = [];
  class Base {
    port = {
      onmessage: (_event: { data: unknown }) => {},
      postMessage: (data: unknown) => messages.push(data),
    };
  }
  runInNewContext(voiceLabWorkletSource, {
    AudioWorkletProcessor: Base,
    sampleRate: 16000,
    registerProcessor: (_name: string, factory: new () => Processor) => {
      Factory = factory;
    },
  });
  assert.ok(Factory);
  const processor = new Factory();
  const output = [[new Float32Array(128).fill(1)]];
  for (let i = 0; i < 128; i++)
    assert.equal(
      processor.process([[new Float32Array(128).fill(0.5)]], output),
      true,
    );
  assert.equal(messages.length, 128);
  assert.equal(
    output[0]![0]!.every((value) => value === 0),
    true,
  );
  assert.equal(processor.process([[new Float32Array(128)]], output), false);
  assert.deepEqual(JSON.parse(JSON.stringify(messages.at(-1))), {
    overflow: true,
  });
  assert.equal(processor.process([[new Float32Array(128)]], output), false);
  assert.equal(messages.length, 129);
});
test("les acquittements permettent une capture web continue sans conserver les buffers", async () => {
  const { runInNewContext } = await import("node:vm");
  const { voiceLabWorkletSource } =
    await import("../src/lib/voice-lab-worklet");
  type Message = { data: ArrayBuffer; timestamp: number };
  type Processor = {
    port: { onmessage: (event: { data: unknown }) => void };
    process: (input: Float32Array[][], output: Float32Array[][]) => boolean;
  };
  let Factory: (new () => Processor) | undefined;
  let last: Message | undefined;
  class Base {
    port = {
      onmessage: (_event: { data: unknown }) => {},
      postMessage: (data: Message) => {
        last = data;
      },
    };
  }
  runInNewContext(voiceLabWorkletSource, {
    AudioWorkletProcessor: Base,
    sampleRate: 16000,
    registerProcessor: (_name: string, factory: new () => Processor) => {
      Factory = factory;
    },
  });
  assert.ok(Factory);
  const processor = new Factory();
  for (let i = 0; i < 300; i++) {
    assert.equal(
      processor.process(
        [[new Float32Array(128).fill(0.5), new Float32Array(128).fill(-0.5)]],
        [[new Float32Array(128)]],
      ),
      true,
    );
    processor.port.onmessage({ data: "ack" });
  }
  assert.ok(last);
  assert.equal(last.timestamp, 2.4);
  assert.equal(last.data.byteLength, 256);
  assert.equal(new DataView(last.data).getInt16(0, true), 0);
});

test("la chronologie distingue réception audio, demande de lecture, playing et réouverture du micro", () => {
  const metrics = new VoiceLabMetrics(0);
  metrics.begin(100);
  metrics.endpoint(1800, 300);
  metrics.finish(400, 2500);
  metrics.final(false, 3000);
  metrics.server({ finish_to_first_audio: 650, asr: 20 });
  metrics.audioReceived(3400);
  metrics.audioReceived(3500); // Later segments cannot replace the first one.
  metrics.playbackRequested(3700);
  metrics.playbackRequested(3800);
  metrics.playing(4100);
  metrics.playing(4500);
  metrics.responseDone(4600);
  metrics.playbackEnded(5000);
  metrics.begin(5200, true);
  const first = metrics.report("android", 5300).turns[0]!;
  assert.equal(first.lastDetectedVoiceAfterCaptureMs, 300);
  assert.equal(first.finishAfterDetectedVoiceMs, 2100);
  assert.equal(first.finalAfterFinishMs, 500);
  assert.equal(first.firstAudioReceivedAfterFinishMs, 900);
  assert.equal(first.playbackRequestAfterFinishMs, 1200);
  assert.equal(first.audioReceiveToRequestMs, 300);
  assert.equal(first.playbackRequestToPlayingMs, 400);
  assert.equal(first.firstJapaneseAfterFinishMs, 1600);
  assert.equal(first.firstJapaneseAfterDetectedVoiceMs, 3700);
  assert.equal(first.transportResidualMs, 250); // Residual, not a network-only measurement.
  assert.equal(first.nextCaptureAfterJapaneseEndedMs, 200);
  assert.equal(first.endpointRequiredSilenceMs, 1800);
  assert.equal(first.endpointVoicedMs, 300);
  const latest = metrics.latest()!;
  assert.equal(latest.firstAudioReceivedAfterFinishMs, 900);
  latest.server.asr = 999;
  assert.equal(metrics.report("android").turns[0]!.server!.asr, 20);

  metrics.finish(null, 6000);
  metrics.audioReceived(6300);
  metrics.playbackRequested(6400);
  metrics.playing(6500);
  metrics.playbackEnded(7000);
  metrics.begin(10000); // A manual pause must not be exported as automatic reopening latency.
  const second = metrics.report("android").turns[1]!;
  assert.equal(second.firstAudioReceivedAfterFinishMs, 300);
  assert.equal(second.audioReceiveToRequestMs, 100);
  assert.equal(second.playbackRequestToPlayingMs, 100);
  assert.equal(second.nextCaptureAfterJapaneseEndedMs, undefined);
  assert.equal(second.transportResidualMs, undefined);
  assert.equal(second.lastDetectedVoiceAfterCaptureMs, undefined);
});

test("le bilan numérique refuse le texte brut et les observations même injectés dans les métriques", () => {
  const metrics = new VoiceLabMetrics(0);
  const marker = "SYNTHETIC_DIAGNOSTIC_NOT_FOR_EXPORT";
  metrics.begin(100);
  metrics.finish(null, 500);
  // Exercise the runtime allowlist at the untrusted data boundary, including
  // numeric properties whose names belong to the diagnostic rather than timing.
  metrics.server({
    asr: 12,
    finish_to_final: 200,
    rawText: marker,
    intent: marker,
    facts: marker,
    acceptedSegments: 2,
    rejectedSegments: 1,
  } as unknown as Record<string, number>);
  const report = metrics.report("android", 1000);
  assert.deepEqual(report.turns[0]!.server, { asr: 12, finish_to_final: 200 });
  assert.equal(report.humanValidation, "pending");
  const serialized = JSON.stringify(report);
  for (const forbidden of [
    marker,
    "rawText",
    "intent",
    "facts",
    "acceptedSegments",
    "rejectedSegments",
  ])
    assert.equal(serialized.includes(forbidden), false, forbidden);
});

test("le diagnostic retrouve la chronologie de son tour pendant la reconnaissance suivante", () => {
  const metrics = new VoiceLabMetrics(0);
  metrics.begin(0, false, 1);
  metrics.finish(500, 1000);
  metrics.final(false, 1200);
  metrics.playing(1500);
  metrics.playbackEnded(2000);
  metrics.begin(2100, true, 2);
  metrics.finish(4000, 6000);
  assert.equal(metrics.latest(1)?.finalAfterFinishMs, 200);
  assert.equal(metrics.latest(1)?.nextCaptureAfterJapaneseEndedMs, 100);
  assert.equal(metrics.latest(2)?.captureWallMs, 3900);
  assert.equal(metrics.latest(2)?.finalAfterFinishMs, undefined);
  assert.equal(metrics.latest(99), null);
});
