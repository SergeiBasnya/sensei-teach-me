import test from "node:test";
import assert from "node:assert/strict";
import { VoiceLabNativeCapture } from "../src/lib/voice-lab-capture";
import {
  pcm16Level,
  VoiceLabEndpoint,
  VoiceLabPcm,
} from "../src/lib/voice-lab-pcm";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function settle() {
  for (let i = 0; i < 15; i++) await Promise.resolve();
}
function harness(
  overrides: Partial<
    ConstructorParameters<typeof VoiceLabNativeCapture>[0]
  > = {},
) {
  const events: string[] = [];
  const capture = new VoiceLabNativeCapture(
    {
      requestPermission: async () => true,
      isForeground: () => true,
      prepare: async () => {},
      start: async () => {
        events.push("start");
      },
      stop: () => {
        events.push("stop");
      },
      ...overrides,
    },
    () => ({
      onBuffer: () => {
        events.push("buffer");
      },
      onReady: () => {
        events.push("ready");
      },
      onError: () => {
        events.push("error");
      },
      onPermission: (value) => {
        events.push(`permission:${value}`);
      },
    }),
  );
  return { capture, events };
}

test("une ancienne permission ne redémarre pas le micro après nettoyage et reprise", async () => {
  const first = deferred<boolean>();
  let requests = 0;
  const { capture, events } = harness({
    requestPermission: () =>
      ++requests === 1 ? first.promise : Promise.resolve(true),
  });
  const stopFirst = capture.begin();
  await settle();
  stopFirst();
  const stopSecond = capture.begin();
  await settle();
  first.resolve(true);
  await settle();
  assert.equal(events.filter((x) => x === "start").length, 1);
  assert.equal(events.filter((x) => x === "ready").length, 1);
  stopSecond();
});

test("une fin de start annulé ne confirme pas une nouvelle capture", async () => {
  const first = deferred<void>();
  let starts = 0;
  const { capture, events } = harness({
    start: async () => {
      events.push(`start:${++starts}`);
      if (starts === 1) await first.promise;
    },
  });
  const stopFirst = capture.begin();
  await settle();
  stopFirst();
  const stopSecond = capture.begin();
  await settle();
  first.resolve();
  await settle();
  assert.equal(events.filter((x) => x === "ready").length, 1);
  assert.ok(
    events.indexOf("start:2") > events.lastIndexOf("stop"),
    "la nouvelle source démarre après l’arrêt complet de l’ancienne",
  );
  stopSecond();
});

test("le replay immédiat des effets ne démarre qu’un propriétaire", async () => {
  const { capture, events } = harness();
  const oldStop = capture.begin();
  oldStop();
  const stop = capture.begin();
  await settle();
  assert.equal(events.filter((x) => x === "start").length, 1);
  assert.equal(events.filter((x) => x === "ready").length, 1);
  const stops = events.filter((x) => x === "stop").length;
  oldStop();
  assert.equal(events.filter((x) => x === "stop").length, stops);
  stop();
});

test("un buffer initial avant résolution de start reste intact, puis le cleanup le ferme", async () => {
  const permission = deferred<boolean>();
  const started = deferred<void>();
  const { capture, events } = harness({
    requestPermission: () => permission.promise,
    start: () => started.promise,
  });
  const input = { data: new ArrayBuffer(2), sampleRate: 16000, channels: 1 };
  capture.buffer(input);
  const stop = capture.begin();
  await settle();
  capture.buffer(input);
  assert.equal(events.includes("buffer"), false);
  permission.resolve(true);
  await settle();
  capture.buffer(input);
  assert.equal(events.filter((x) => x === "buffer").length, 1);
  stop();
  capture.buffer(input);
  started.resolve();
  await settle();
  assert.equal(events.filter((x) => x === "buffer").length, 1);
  assert.equal(events.includes("ready"), false);
  assert.equal(events.includes("error"), false);
});

test("le passage en arrière-plan pendant la préparation empêche le démarrage", async () => {
  const prepared = deferred<void>();
  let foreground = true;
  const { capture, events } = harness({
    isForeground: () => foreground,
    prepare: () => prepared.promise,
  });
  const stop = capture.begin();
  await settle();
  foreground = false;
  prepared.resolve();
  await settle();
  assert.equal(events.includes("start"), false);
  assert.equal(events.filter((x) => x === "error").length, 1);
  stop();
});

test("permission refusée ou échec natif ferment les buffers sans fausse confirmation", async () => {
  for (const overrides of [
    { requestPermission: async () => false },
    {
      start: async () => {
        throw new Error("native_start_failed");
      },
    },
  ]) {
    const { capture, events } = harness(overrides);
    const stop = capture.begin();
    await settle();
    capture.buffer({
      data: new ArrayBuffer(2),
      sampleRate: 16000,
      channels: 1,
    });
    assert.equal(events.includes("ready"), false);
    assert.equal(events.includes("buffer"), false);
    assert.equal(events.filter((x) => x === "error").length, 1);
    stop();
  }
});

function encode(samples: number[]) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((value, index) => view.setInt16(index * 2, value, true));
  return bytes;
}
function combine(chunks: Uint8Array[]) {
  const bytes = new Uint8Array(
    chunks.reduce((n, chunk) => n + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

test("PCM16 Android 16 kHz : aucun octet initial ou final perdu sur des frontières irrégulières", () => {
  const samples = Array.from(
    { length: 16037 },
    (_, i) => ((i * 7919) % 65536) - 32768,
  );
  samples[0] = -32768;
  samples[samples.length - 1] = 32767;
  const input = encode(samples);
  const converter = new VoiceLabPcm();
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < samples.length; i += 997)
    chunks.push(
      ...converter.push({
        data: input.slice(i * 2, Math.min(samples.length, i + 997) * 2).buffer,
        sampleRate: 16000,
        channels: 1,
      }),
    );
  const tail = converter.flush();
  assert.ok(tail);
  chunks.push(tail);
  assert.deepEqual(combine(chunks), input);
  assert.equal(tail.length, 74);
  assert.equal(converter.snapshot().outputSamples, samples.length);
  assert.equal(converter.flush(), null);
});

test("chaque fréquence de repli Expo conserve durée, fréquence et niveau d’un ton synthétique", () => {
  for (const sampleRate of [8000, 16000, 22050, 44100, 48000]) {
    const input = encode(
      Array.from({ length: sampleRate }, (_, i) =>
        Math.round(12000 * Math.sin((2 * Math.PI * 1000 * i) / sampleRate)),
      ),
    );
    const converter = new VoiceLabPcm();
    const chunks = converter.push({
      data: input.buffer,
      sampleRate,
      channels: 1,
    });
    const tail = converter.flush();
    if (tail) chunks.push(tail);
    const result = combine(chunks);
    assert.equal(result.length, 32000, `${sampleRate} Hz : durée`);
    const gain = pcm16Level(result) / pcm16Level(input);
    assert.ok(gain > 0.95 && gain <= 1.01, `${sampleRate} Hz : gain ${gain}`);
    let rising = 0;
    const view = new DataView(result.buffer);
    for (let i = 1; i < result.length / 2; i++)
      if (
        view.getInt16((i - 1) * 2, true) <= 0 &&
        view.getInt16(i * 2, true) > 0
      )
        rising++;
    assert.ok(Math.abs(rising - 1000) <= 1, `${sampleRate} Hz : fréquence`);
    assert.equal(converter.snapshot().capturedMs, 1000);
    assert.equal(converter.snapshot().sourceRateHz, sampleRate);
  }
});

const spoken = encode(Array.from({ length: 1600 }, () => 4000));
const quiet = encode(Array.from({ length: 1600 }, () => 0));
function observeUntil(endpoint: VoiceLabEndpoint, from: number, to: number) {
  let decision = "listen";
  for (let now = from; now <= to; now += 100)
    decision = endpoint.observe(quiet, now);
  return decision;
}
test("une réponse entière de 100 ms confirmée deux fois finit après 3,2 s, sans raccourcir la marge", () => {
  for (const text of ["はい。", "いいえ。"]) {
    const endpoint = new VoiceLabEndpoint(0);
    endpoint.observe(spoken, 100);
    endpoint.notePartial(text, false);
    endpoint.notePartial(text, false);
    assert.equal(observeUntil(endpoint, 200, 3200), "listen");
    assert.equal(endpoint.observe(quiet, 3300), "finish");
    assert.equal(endpoint.voicedDurationMs, 100);
    assert.equal(endpoint.requiredSilenceMs, 3200);
    assert.equal(endpoint.decisionReason, "short_answer");
    assert.equal(endpoint.lastDetectedVoiceAt, 100);
  }
});
test("100 ms de bruit, un seul partiel ou une hésitation ne suffisent pas à envoyer un tour", () => {
  for (const texts of [
    [],
    ["はい。"],
    ["はい、", "はい、"],
    ["あの。", "あの。"],
    ["ホットで", "ホットで"],
  ]) {
    const endpoint = new VoiceLabEndpoint(0);
    endpoint.observe(spoken, 100);
    for (const text of texts) endpoint.notePartial(text, false);
    assert.equal(observeUntil(endpoint, 200, 19900), "listen");
    assert.equal(endpoint.observe(quiet, 20000), "quiet");
    assert.equal(endpoint.decisionReason, "insufficient_voice");
  }
});
test("un partiel incertain suivi d’un seul confiant ne vaut pas deux confirmations", () => {
  const endpoint = new VoiceLabEndpoint(0);
  endpoint.observe(spoken, 100);
  endpoint.observe(spoken, 200);
  endpoint.notePartial("はい。", true);
  endpoint.notePartial("はい。", false);
  assert.equal(observeUntil(endpoint, 300, 2000), "listen");
  assert.equal(endpoint.decisionReason, "unstable_partial");
  assert.equal(observeUntil(endpoint, 2100, 3400), "finish");
});
test("le choix chaud/glacé complet garde 3,2 s seulement après une question explicite", () => {
  for (const text of ["ホットで。", "アイスで。"]) {
    const endpoint = new VoiceLabEndpoint(0, {
      question: "コーヒーですね。ホットですか、アイスですか？",
    });
    endpoint.observe(spoken, 100);
    endpoint.observe(spoken, 200);
    endpoint.notePartial(text, false);
    endpoint.notePartial(text, false);
    assert.equal(observeUntil(endpoint, 300, 3300), "listen");
    assert.equal(endpoint.observe(quiet, 3400), "finish");
    assert.equal(endpoint.decisionReason, "contextual_choice");
    assert.equal(endpoint.requiredSilenceMs, 3200);
  }
});
test("la question d’origine et les vraies hésitations gardent leur marge de 5 s", () => {
  for (const [question, text] of [
    ["どこから来ましたか？", "ホットで。"],
    ["ホットですか、アイスですか？", "えっと。"],
    ["ホットですか、アイスですか？", "ホットで、あの。"],
    ["ホットですか、アイスですか？", "ホットで、"],
  ]) {
    const endpoint = new VoiceLabEndpoint(0, { question });
    endpoint.observe(spoken, 100);
    endpoint.observe(spoken, 200);
    endpoint.notePartial(text!, false);
    endpoint.notePartial(text!, false);
    assert.equal(observeUntil(endpoint, 300, 5100), "listen");
    assert.equal(endpoint.observe(quiet, 5200), "finish");
    assert.equal(endpoint.decisionReason, "unfinished");
    assert.equal(endpoint.requiredSilenceMs, 5000);
  }
});
