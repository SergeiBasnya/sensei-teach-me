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

const weak = encode(
  Array.from({ length: 1600 }, (_, i) =>
    Math.round(80 * Math.sin((2 * Math.PI * 440 * i) / 16000)),
  ),
);
let noiseSeed = 7;
const weakNoise = encode(
  Array.from({ length: 1600 }, () => {
    noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0;
    return ((noiseSeed >>> 16) % 161) - 80;
  }),
);
function weakTurn(
  texts: { text: string; uncertain?: boolean; at: number }[],
  input = weak,
  duration = 1600,
  options: { question?: string } = {},
) {
  const endpoint = new VoiceLabEndpoint(0, options);
  let decision = "listen";
  let firstFinish: number | null = null;
  for (let now = 100; now <= 20_000; now += 100) {
    decision = endpoint.observe(now <= duration ? input : quiet, now);
    for (const partial of texts.filter((item) => item.at === now))
      endpoint.notePartial(partial.text, partial.uncertain ?? false);
    if (decision === "finish" && firstFinish === null) firstFinish = now;
  }
  return { endpoint, decision, firstFinish };
}
test("signal faible : deux partiels prudents permettent le final après 3,2 s de silence", () => {
  const result = weakTurn([
    { at: 1700, text: "フランスから来ました。" },
    { at: 2700, text: "フランスから来ました。" },
  ]);
  assert.equal(result.firstFinish, 4800);
  assert.equal(result.endpoint.voicedDurationMs, 0);
  assert.equal(result.endpoint.lastDetectedVoiceAt, 1600);
  assert.equal(result.endpoint.requiredSilenceMs, 3200);
});
test("signal faible : bruit, partiel isolé/incertain, kanji répété ou signal sous le gate ne suffisent pas", () => {
  for (const texts of [
    [],
    [{ at: 1700, text: "フランスから来ました。" }],
    [
      { at: 1700, text: "フランスから来ました。", uncertain: true },
      { at: 2700, text: "フランスから来ました。" },
    ],
    [
      { at: 1700, text: "生" },
      { at: 2700, text: "生" },
    ],
    [
      { at: 1700, text: "生生生生生生" },
      { at: 2700, text: "生生生生生生" },
    ],
    [
      { at: 1700, text: "フランスから来ました。" },
      { at: 1700, text: "フランスから来ました。" },
    ],
  ]) {
    const result = weakTurn(texts);
    assert.equal(result.firstFinish, null);
    assert.equal(result.decision, "quiet");
  }
  const veryWeak = encode(
    Array.from({ length: 1600 }, (_, i) => Math.round(15 * Math.sin(i))),
  );
  assert.equal(
    weakTurn(
      [
        { at: 1700, text: "フランスから来ました。" },
        { at: 2700, text: "フランスから来ました。" },
      ],
      veryWeak,
    ).firstFinish,
    null,
  );
  assert.equal(weakTurn([], weakNoise).firstFinish, null);
  assert.equal(
    weakTurn(
      [
        { at: 1700, text: "生" },
        { at: 2700, text: "生" },
      ],
      weakNoise,
    ).firstFinish,
    null,
  );
  assert.equal(
    weakTurn([
      { at: 1700, text: "フランスから来ました。" },
      { at: 2700, text: "フランスから来ました。", uncertain: true },
    ]).firstFinish,
    null,
  );
});
test("signal faible : réponse très courte confirmée, mais pas un bruit bref avec une phrase hallucinée", () => {
  for (const text of ["はい。", "いいえ。"]) {
    assert.equal(
      weakTurn(
        [
          { at: 1000, text },
          { at: 2000, text },
        ],
        weak,
        100,
      ).firstFinish,
      3300,
    );
  }
  assert.equal(
    weakTurn(
      [
        { at: 1000, text: "フランスから来ました。" },
        { at: 2000, text: "フランスから来ました。" },
      ],
      weak,
      100,
    ).firstFinish,
    null,
  );
  for (const question of [
    "ホットですか、アイスですか？",
    "どこから来ましたか？",
  ]) {
    const result = weakTurn(
      [
        { at: 1000, text: "ホットで。" },
        { at: 2000, text: "ホットで。" },
      ],
      weak,
      300,
      { question },
    );
    assert.equal(
      result.firstFinish,
      question.startsWith("ホット") ? 3500 : null,
    );
  }
});
test("signal faible : une hésitation et un bruit continu ne déclenchent pas une fin prématurée", () => {
  assert.equal(
    weakTurn([
      { at: 1700, text: "えっと。" },
      { at: 2700, text: "えっと。" },
    ]).firstFinish,
    null,
  );
  assert.equal(
    weakTurn(
      [
        { at: 1700, text: "フランスから来ました。" },
        { at: 2700, text: "フランスから来ました。" },
      ],
      weakNoise,
      20_000,
    ).firstFinish,
    null,
  );
  const endpoint = new VoiceLabEndpoint(0);
  for (let now = 100; now <= 1000; now += 100) endpoint.observe(weak, now);
  endpoint.notePartial("えっと。", false);
  observeUntil(endpoint, 1100, 2000);
  endpoint.notePartial("えっと。", false);
  assert.equal(observeUntil(endpoint, 2100, 3000), "listen");
  for (let now = 3100; now <= 4000; now += 100) endpoint.observe(weak, now);
  endpoint.notePartial("フランスから来ました。", false);
  observeUntil(endpoint, 4100, 5000);
  endpoint.notePartial("フランスから来ました。", false);
  assert.equal(observeUntil(endpoint, 5100, 7100), "listen");
  assert.equal(endpoint.observe(quiet, 7200), "finish");
});
