import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createApp } from "../server/app";
import { createVoiceLab } from "../server/voice-lab";
import { voiceLabServerSchema, VOICE_LAB } from "../shared/voice-lab";

const token = "voice-lab-test-personal-token";
const auth = { Authorization: `Bearer ${token}` };
const delay = (ms = 15) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean) {
  const end = Date.now() + 2500;
  while (!check()) {
    assert.ok(Date.now() < end, "Timed out waiting for a laboratory event");
    await delay(5);
  }
}
type Event = ReturnType<typeof voiceLabServerSchema.parse>;
async function fixture(
  options: Partial<Parameters<typeof createVoiceLab>[0]>,
  run: (input: {
    base: string;
    lab: ReturnType<typeof createVoiceLab>;
    ticket: () => Promise<string>;
    connect: (
      ticket?: string,
      origin?: string,
    ) => Promise<{ socket: WebSocket; events: Event[] }>;
  }) => Promise<void>,
) {
  const lab = createVoiceLab({
    transcribe: async () => ({
      text: "フランスです。",
      uncertain: false,
      metrics: {},
    }),
    partialEveryMs: 10,
    tickMs: 5,
    ...options,
  });
  const server = createApp({ token, voiceLab: lab }).listen(0, "127.0.0.1");
  lab.attach(server, { origins: ["http://localhost:8787"] });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const ticket = async () => {
    const response = await fetch(`${base}/api/voice-lab/session`, {
      method: "POST",
      headers: auth,
    });
    assert.equal(response.status, 200);
    return ((await response.json()) as { ticket: string }).ticket;
  };
  const connect = async (value?: string, origin?: string) => {
    const socket = new WebSocket(
      `${base.replace("http:", "ws:")}${VOICE_LAB.path}?ticket=${value || (await ticket())}`,
      { origin },
    );
    const events: Event[] = [];
    socket.on("message", (data) =>
      events.push(voiceLabServerSchema.parse(JSON.parse(data.toString()))),
    );
    socket.on("error", () => {});
    await until(() => events.some((event) => event.type === "ready"));
    return { socket, events };
  };
  try {
    await run({ base, lab, ticket, connect });
  } finally {
    lab.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
function command(socket: WebSocket, value: object) {
  socket.send(JSON.stringify(value));
}
function chunk(socket: WebSocket, turn = 1, sequence = 0, samples = 3200) {
  const frame = Buffer.alloc(8 + samples * 2);
  frame.writeUInt32LE(turn, 0);
  frame.writeUInt32LE(sequence, 4);
  socket.send(frame);
}
async function rejected(url: string, origin?: string) {
  return await new Promise<number | undefined>((resolve) => {
    const socket = new WebSocket(url, { origin });
    socket.on("error", () => {});
    socket.once("unexpected-response", (_request, response) => {
      resolve(response.statusCode);
      socket.terminate();
    });
  });
}

test("le laboratoire exige l’auth HTTP et refuse les tickets expirés, réutilisés et origines étrangères", async () => {
  let clock = 100;
  await fixture({ now: () => clock }, async ({ base, ticket, connect }) => {
    const unauthorized = await fetch(`${base}/api/voice-lab/session`, {
      method: "POST",
    });
    assert.equal(unauthorized.status, 401);
    const expired = await ticket();
    clock += 30_000;
    const path = `${base.replace("http:", "ws:")}${VOICE_LAB.path}?ticket=`;
    assert.equal(await rejected(path + expired), 403);
    const used = await ticket();
    const client = await connect(used);
    assert.equal(await rejected(path + used), 403);
    client.socket.close();
    await until(() => client.socket.readyState === WebSocket.CLOSED);
    const foreign = await ticket();
    assert.equal(
      await rejected(path + foreign, "https://untrusted.example"),
      403,
    );
    assert.equal(await rejected(path + foreign), 403); // Rejected attempt also consumes it.
    assert.equal(await rejected(path), 403);
  });
});

test("le mode classique garde le laboratoire désactivé sans injection explicite", async () => {
  const server = createApp({ token }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/voice-lab/session`,
      { method: "POST", headers: auth },
    );
    assert.equal(response.status, 503);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("un flux ordonné arrive au moteur PCM sans conversion et ses résultats provisoires ne déclenchent pas de réponse", async () => {
  let teaching = 0;
  const calls: { partial: boolean; bytes: number }[] = [];
  await fixture(
    {
      transcribe: async (pcm, options) => {
        calls.push({ partial: options.partial, bytes: pcm.length });
        assert.equal(options.language, "ja");
        assert.equal(pcm.readInt16LE(0), 0);
        return {
          text: "フランスです。",
          uncertain: false,
          metrics: { asr: 12, invalid: Number.NaN, bad: -1 },
        };
      },
      respond: async () => {
        teaching++;
      },
    },
    async ({ connect }) => {
      const { socket, events } = await connect();
      command(socket, {
        type: "start",
        turn: 1,
        language: "ja",
        respond: true,
      });
      for (let index = 0; index < 4; index++) chunk(socket, 1, index);
      await until(() => events.some((event) => event.type === "partial"));
      assert.equal(teaching, 0);
      assert.deepEqual(calls, [{ partial: true, bytes: 25_600 }]);
      await delay(30);
      assert.equal(calls.length, 1); // No repeated snapshot without new audio.
      command(socket, { type: "finish", turn: 1 });
      await until(() =>
        events.some(
          (event) => event.type === "state" && event.state === "complete",
        ),
      );
      assert.equal(teaching, 1);
      assert.deepEqual(calls[1], { partial: false, bytes: 25_600 });
      const final = events.find((event) => event.type === "final");
      assert.ok(final?.type === "final");
      assert.equal(final.metrics.asr, 12);
      assert.equal(final.metrics.bad, undefined);
      assert.equal(final.metrics.invalid, undefined);
    },
  );
});

test("une coupure de séquence ou un encodage invalide interdit toute correction", async () => {
  for (const invalid of ["gap", "odd", "too-large"] as const) {
    let inferences = 0;
    await fixture(
      {
        transcribe: async () => {
          inferences++;
          return { text: "", uncertain: true, metrics: {} };
        },
      },
      async ({ connect }) => {
        const { socket, events } = await connect();
        command(socket, { type: "start", turn: 1, language: "auto" });
        if (invalid === "gap") chunk(socket, 1, 2);
        else if (invalid === "odd") socket.send(Buffer.alloc(11));
        else socket.send(Buffer.alloc(6410));
        await until(() => socket.readyState === WebSocket.CLOSED);
        assert.equal(inferences, 0);
        assert.equal(
          events.some((event) => event.type === "final"),
          false,
        );
        if (invalid !== "too-large")
          assert.equal(
            events.some((event) => event.type === "error"),
            true,
          );
      },
    );
  }
});

test("pause et reprise invalident un ASR ancien sans lancer deux inférences simultanées", async () => {
  let release: (() => void) | undefined;
  let count = 0,
    parallel = 0,
    maximum = 0;
  await fixture(
    {
      transcribe: async (_pcm, options) => {
        count++;
        maximum = Math.max(maximum, ++parallel);
        if (count === 1)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        parallel--;
        return {
          text: options.partial ? "ancienne phrase" : "新しいです。",
          uncertain: false,
          metrics: {},
        };
      },
    },
    async ({ connect }) => {
      const { socket, events } = await connect();
      command(socket, { type: "start", turn: 1, language: "ja" });
      for (let index = 0; index < 4; index++) chunk(socket, 1, index);
      await until(() => count === 1);
      command(socket, { type: "pause", turn: 1 });
      command(socket, { type: "start", turn: 2, language: "ja" });
      chunk(socket, 2, 0);
      command(socket, { type: "finish", turn: 2 });
      await delay(20);
      assert.equal(count, 1);
      release?.();
      await until(() =>
        events.some((event) => event.type === "final" && event.turn === 2),
      );
      assert.equal(maximum, 1);
      assert.equal(
        events.some((event) => event.type === "partial" && event.turn === 1),
        false,
      );
      assert.equal(
        events.some((event) => event.type === "final" && event.turn === 1),
        false,
      );
    },
  );
});

test("le résultat final a priorité sur un autre partiel en attente dans le mutex global", async () => {
  let release: (() => void) | undefined;
  const calls: boolean[] = [];
  await fixture(
    {
      transcribe: async (_pcm, options) => {
        calls.push(options.partial);
        if (calls.length === 1)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        return { text: "はい。", uncertain: false, metrics: {} };
      },
    },
    async ({ connect }) => {
      const a = await connect(),
        b = await connect();
      for (const client of [a, b]) {
        command(client.socket, { type: "start", turn: 1, language: "ja" });
        for (let index = 0; index < 4; index++) chunk(client.socket, 1, index);
      }
      await until(() => calls.length === 1);
      await delay(20); // Other socket has queued its single partial.
      command(a.socket, { type: "finish", turn: 1 });
      await until(() =>
        a.events.some(
          (event) => event.type === "state" && event.state === "recognizing",
        ),
      );
      release?.();
      await until(() => calls.length === 3);
      assert.deepEqual(calls, [true, false, true]);
    },
  );
});

test("un ASR incertain ne déclenche ni enseignement ni historique pédagogique", async () => {
  let responses = 0;
  await fixture(
    {
      transcribe: async () => ({
        text: "peut-être",
        uncertain: true,
        metrics: {},
      }),
      respond: async () => {
        responses++;
      },
    },
    async ({ connect }) => {
      const { socket, events } = await connect();
      command(socket, {
        type: "start",
        turn: 1,
        language: "auto",
        respond: true,
      });
      chunk(socket);
      command(socket, { type: "finish", turn: 1 });
      await until(() => events.some((event) => event.type === "response_done"));
      assert.equal(responses, 0);
      assert.equal(
        events.some((event) => event.type === "tutor"),
        false,
      );
    },
  );
});

test("l’échantillon consenti reste disponible pour comparer une panne de reconnaissance", async () => {
  let saved = false;
  await fixture(
    {
      retainSample: async () => {
        saved = true;
        return { id: "diagnostic_only" };
      },
      transcribe: async () => {
        assert.equal(saved, true);
        throw new Error("synthetic ASR failure");
      },
    },
    async ({ connect }) => {
      const { socket, events } = await connect();
      command(socket, {
        type: "start",
        turn: 1,
        language: "ja",
        keepSample: true,
      });
      chunk(socket);
      command(socket, { type: "finish", turn: 1 });
      await until(() => events.some((event) => event.type === "error"));
      assert.equal(
        events.some((event) => event.type === "sample_saved"),
        true,
      );
      assert.equal(
        events.some((event) => event.type === "final"),
        false,
      );
    },
  );
});

test("une transcription tronquée ou illisible reste incertaine et ne devient pas une correction", async () => {
  for (const text of ["あ".repeat(1001), "フランス�"]) {
    let responses = 0;
    await fixture(
      {
        transcribe: async () => ({ text, uncertain: false, metrics: {} }),
        respond: async () => {
          responses++;
        },
      },
      async ({ connect }) => {
        const { socket, events } = await connect();
        command(socket, {
          type: "start",
          turn: 1,
          language: "ja",
          respond: true,
        });
        chunk(socket);
        command(socket, { type: "finish", turn: 1 });
        await until(() =>
          events.some((event) => event.type === "response_done"),
        );
        const final = events.find((event) => event.type === "final");
        assert.ok(final?.type === "final" && final.uncertain);
        assert.equal(responses, 0);
      },
    );
  }
});

test("un WAV diagnostic est conservé uniquement avec opt-in et un tour final non annulé", async () => {
  const retained: number[] = [];
  await fixture(
    {
      retainSample: async (pcm, options) => {
        retained.push(options.turn);
        assert.equal(pcm.length, 6400);
        return { id: `sample_${options.turn}` };
      },
    },
    async ({ connect }) => {
      const { socket, events } = await connect();
      for (const turn of [1, 2, 3]) {
        command(socket, {
          type: "start",
          turn,
          language: "ja",
          keepSample: turn !== 1,
        });
        chunk(socket, turn);
        command(socket, { type: turn === 3 ? "pause" : "finish", turn });
        await until(() =>
          events.some(
            (event) =>
              event.type === "state" &&
              event.turn === turn &&
              (event.state === "complete" || event.state === "paused"),
          ),
        );
      }
      assert.deepEqual(retained, [2]);
      assert.deepEqual(
        events.filter((event) => event.type === "sample_saved"),
        [{ type: "sample_saved", turn: 2, id: "sample_2" }],
      );
    },
  );
});

test("le serveur borne les sessions actives et les rafales au lieu d’accumuler des fragments", async () => {
  await fixture({}, async ({ base, connect }) => {
    await connect();
    await connect();
    assert.equal(
      (
        await fetch(`${base}/api/voice-lab/session`, {
          method: "POST",
          headers: auth,
        })
      ).status,
      503,
    );
  });
  let calls = 0;
  await fixture(
    {
      transcribe: async () => {
        calls++;
        return { text: "", uncertain: true, metrics: {} };
      },
    },
    async ({ connect }) => {
      const { socket, events } = await connect();
      command(socket, { type: "start", turn: 1, language: "ja" });
      for (let sequence = 0; sequence < 21; sequence++)
        chunk(socket, 1, sequence);
      await until(() => socket.readyState === WebSocket.CLOSED);
      assert.equal(
        events.some(
          (event) => event.type === "error" && event.code === "limit",
        ),
        true,
      );
      assert.equal(calls, 0);
    },
  );
});

test("une interruption invalide les segments tardifs et n’inscrit pas une réponse inachevée dans le contexte", async () => {
  let release: (() => void) | undefined;
  const histories: number[] = [];
  const tutor = {
    reply: {
      japanese: "どこから来ましたか？",
      romaji: "Doko kara kimashita ka?",
      french: "D’où viens-tu ?",
    },
    correction: null,
    coaching: null,
    vocabulary: [],
  };
  await fixture(
    {
      respond: async ({ emit, history, turn }) => {
        histories.push(history.length);
        emit({ type: "tutor", tutor });
        if (turn === 1)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        emit({
          type: "audio",
          index: 0,
          audio: "UklGRg".repeat(20),
          format: "wav",
        });
        emit({ type: "response_done" });
      },
    },
    async ({ connect }) => {
      const { socket, events } = await connect();
      command(socket, {
        type: "start",
        turn: 1,
        language: "ja",
        respond: true,
      });
      chunk(socket);
      command(socket, { type: "finish", turn: 1 });
      await until(() =>
        events.some((event) => event.type === "tutor" && event.turn === 1),
      );
      command(socket, { type: "pause", turn: 1 });
      command(socket, {
        type: "start",
        turn: 2,
        language: "ja",
        respond: true,
      });
      chunk(socket, 2);
      command(socket, { type: "finish", turn: 2 });
      await until(() =>
        events.some(
          (event) =>
            event.type === "state" &&
            event.state === "recognizing" &&
            event.turn === 2,
        ),
      );
      release?.();
      await until(() =>
        events.some(
          (event) => event.type === "response_done" && event.turn === 2,
        ),
      );
      assert.equal(
        events.some((event) => event.type === "audio" && event.turn === 1),
        false,
      );
      assert.equal(
        events.some(
          (event) => event.type === "response_done" && event.turn === 1,
        ),
        false,
      );
      command(socket, {
        type: "start",
        turn: 3,
        language: "ja",
        respond: true,
      });
      chunk(socket, 3);
      command(socket, { type: "finish", turn: 3 });
      await until(() =>
        events.some(
          (event) => event.type === "response_done" && event.turn === 3,
        ),
      );
      assert.deepEqual(histories, [0, 0, 2]);
    },
  );
});

test("aucun segment audio ne précède la réponse pédagogique validée", async () => {
  await fixture(
    {
      respond: async ({ emit }) => {
        emit({
          type: "audio",
          index: 0,
          audio: "UklGRg".repeat(20),
          format: "wav",
        });
      },
    },
    async ({ connect }) => {
      const { socket, events } = await connect();
      command(socket, {
        type: "start",
        turn: 1,
        language: "ja",
        respond: true,
      });
      chunk(socket);
      command(socket, { type: "finish", turn: 1 });
      await until(() => events.some((event) => event.type === "error"));
      assert.equal(
        events.some((event) => event.type === "audio"),
        false,
      );
    },
  );
});

test("les détails enrichissent seulement la phrase validée après son premier audio", async () => {
  const histories: { role: string; content: string }[][] = [];
  const tutor = {
    reply: {
      japanese: "どこから来ましたか？",
      romaji: "Doko kara kimashita ka?",
      french: "",
    },
    correction: null,
    vocabulary: [],
  };
  await fixture(
    {
      respond: async ({ emit, history }) => {
        histories.push(history);
        emit({ type: "tutor", tutor });
        emit({
          type: "audio",
          index: 0,
          audio: "UklGRg".repeat(20),
          format: "wav",
        });
        emit({
          type: "details",
          japanese: tutor.reply.japanese,
          french: "D’où viens-tu ?",
          coaching: null,
        });
        emit({ type: "response_done" });
      },
    },
    async ({ connect }) => {
      const { socket, events } = await connect();
      for (const turn of [1, 2]) {
        command(socket, { type: "start", turn, language: "ja", respond: true });
        chunk(socket, turn);
        command(socket, { type: "finish", turn });
        await until(() =>
          events.some(
            (event) => event.type === "response_done" && event.turn === turn,
          ),
        );
      }
      assert.equal(
        events.filter((event) => event.type === "details").length,
        2,
      );
      assert.equal(histories[1]?.at(-1)?.content, tutor.reply.japanese);
    },
  );
});

test("le mutex du laboratoire garde aussi les ASR suivants derrière la réponse Qwen", async () => {
  let asrCalls = 0;
  let responding = false;
  let overlap = false;
  let release!: () => void;
  await fixture(
    {
      transcribe: async () => {
        asrCalls++;
        overlap ||= responding;
        return { text: "フランスです。", uncertain: false, metrics: {} };
      },
      respond: async ({ emit }) => {
        if (asrCalls === 1) {
          responding = true;
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          responding = false;
        }
        emit({ type: "response_done" });
      },
    },
    async ({ connect }) => {
      const a = await connect(),
        b = await connect();
      command(a.socket, {
        type: "start",
        turn: 1,
        language: "ja",
        respond: true,
      });
      chunk(a.socket);
      command(a.socket, { type: "finish", turn: 1 });
      await until(() => responding);
      command(b.socket, {
        type: "start",
        turn: 1,
        language: "ja",
        respond: true,
      });
      chunk(b.socket);
      command(b.socket, { type: "finish", turn: 1 });
      await delay(25);
      assert.equal(asrCalls, 1);
      release();
      await until(() =>
        b.events.some((event) => event.type === "response_done"),
      );
      assert.equal(asrCalls, 2);
      assert.equal(overlap, false);
    },
  );
});

test("des détails précoces ou visant un autre japonais sont refusés par le transport", async () => {
  for (const mismatch of [false, true]) {
    const tutor = {
      reply: {
        japanese: "どこから来ましたか？",
        romaji: "Doko kara kimashita ka?",
        french: "",
      },
      correction: null,
      vocabulary: [],
    };
    await fixture(
      {
        respond: async ({ emit }) => {
          emit({ type: "tutor", tutor });
          if (mismatch)
            emit({
              type: "audio",
              index: 0,
              audio: "UklGRg".repeat(20),
              format: "wav",
            });
          emit({
            type: "details",
            japanese: mismatch ? "別の文。" : tutor.reply.japanese,
            french: "Une traduction.",
            coaching: null,
          });
        },
      },
      async ({ connect }) => {
        const { socket, events } = await connect();
        command(socket, {
          type: "start",
          turn: 1,
          language: "ja",
          respond: true,
        });
        chunk(socket);
        command(socket, { type: "finish", turn: 1 });
        await until(() => events.some((event) => event.type === "error"));
        assert.equal(
          events.some((event) => event.type === "details"),
          false,
        );
      },
    );
  }
});
