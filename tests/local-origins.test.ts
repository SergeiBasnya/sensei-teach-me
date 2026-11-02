import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { localOrigins } from "../scripts/local-origins";
import { createApp } from "../server/app";
import { createVoiceLab } from "../server/voice-lab";
import { VOICE_LAB } from "../shared/voice-lab";

const ipv4 = (address: string, internal = false) => ({
  address,
  internal,
  family: "IPv4" as const,
  netmask: "255.255.255.0",
  mac: "00:00:00:00:00:00",
  cidr: `${address}/24`,
});
const interfaces = {
  lo0: [ipv4("127.0.0.1", true)],
  en0: [ipv4("192.168.1.31")],
  unused: undefined,
};

test("origines LAN limitées aux adresses exactes du Mac et ports de développement", () => {
  const origins = localOrigins(true, interfaces);
  assert.ok(origins.includes("http://192.168.1.31:8787"));
  assert.ok(origins.includes("http://192.168.1.31:8083"));
  assert.ok(origins.includes("http://localhost:8083"));
  assert.ok(!origins.includes("http://192.168.1.32:8787"));
  assert.ok(!origins.includes("http://192.168.1.31:9000"));
  assert.ok(!origins.includes("*"));
  assert.ok(
    !localOrigins(false, interfaces).some((origin) =>
      origin.includes("192.168.1.31"),
    ),
  );
  assert.ok(
    localOrigins(true, { en0: [ipv4("192.168.1.66")] }).includes(
      "http://192.168.1.66:8787",
    ),
  );
});

test("handshake Android avec ticket fonctionne sans ouvrir les origines étrangères", async () => {
  const token = "local-origins-test-token";
  const origins = localOrigins(true, interfaces);
  const lab = createVoiceLab({
    transcribe: async () => ({ text: "", uncertain: true, metrics: {} }),
  });
  const server = createApp({ token, origins, voiceLab: lab }).listen(
    0,
    "127.0.0.1",
  );
  lab.attach(server, { origins });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const ticket = async () => {
    const response = await fetch(base + "/api/voice-lab/session", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
    return ((await response.json()) as { ticket: string }).ticket;
  };
  const handshake = async (capability: string, origin: string) =>
    new Promise<string | number>((resolve, reject) => {
      const ws = new WebSocket(
        base.replace("http:", "ws:") + VOICE_LAB.path + "?ticket=" + capability,
        { origin },
      );
      const timer = setTimeout(() => {
        ws.terminate();
        reject(Error("handshake timeout"));
      }, 2500);
      ws.on("error", () => {});
      ws.once("unexpected-response", (_, response) => {
        clearTimeout(timer);
        ws.terminate();
        resolve(response.statusCode!);
      });
      ws.once("message", (raw) => {
        clearTimeout(timer);
        ws.close();
        resolve((JSON.parse(raw.toString()) as { type: string }).type);
      });
    });
  try {
    assert.equal(
      (await fetch(base + "/api/voice-lab/session", { method: "POST" })).status,
      401,
    );
    const used = await ticket();
    assert.equal(await handshake(used, "http://192.168.1.31:8787"), "ready");
    assert.equal(await handshake(used, "http://192.168.1.31:8787"), 403);
    for (const origin of [
      "https://untrusted.example",
      "http://192.168.1.32:8787",
      "http://192.168.1.31:9000",
    ])
      assert.equal(await handshake(await ticket(), origin), 403);
  } finally {
    lab.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
