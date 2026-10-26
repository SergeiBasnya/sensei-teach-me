import test from "node:test";
import assert from "node:assert/strict";
import {
  initialServerUrl,
  isLoopbackUrl,
  readStoredConnection,
} from "../src/lib/connection-config";

test("le téléphone déduit l’adresse du Mac Expo au lieu de viser son propre localhost", () => {
  assert.equal(
    initialServerUrl("native", "http://localhost:8787", "192.168.1.66:8083"),
    "http://192.168.1.66:8787",
  );
  assert.equal(
    initialServerUrl("native", "http://127.0.0.1:8787", "10.0.0.8:8081"),
    "http://10.0.0.8:8787",
  );
  assert.equal(initialServerUrl("native", "http://localhost:8787"), "");
  assert.equal(
    initialServerUrl("native", "http://localhost:8787", "localhost:8083"),
    "",
  );
});

test("une adresse personnelle explicite est conservée ; le web garde son adresse locale", () => {
  assert.equal(
    initialServerUrl("native", "https://mochi.example/", "192.168.1.66:8083"),
    "https://mochi.example",
  );
  assert.equal(
    initialServerUrl("web", "http://localhost:8787", "192.168.1.66:8083"),
    "http://localhost:8787",
  );
  assert.equal(isLoopbackUrl("http://[::1]:8787"), true);
  assert.equal(isLoopbackUrl("http://192.168.1.66:8787"), false);
});

test("la connexion restaurée ne conserve aucune ancienne déclaration de disponibilité", () => {
  const config = readStoredConnection(
    JSON.stringify({
      url: " https://mochi.example/ ",
      token: " exemple-de-code-personnel ",
      mode: "local",
      oral: true,
      ready: true,
    }),
  );
  assert.deepEqual(config, {
    url: "https://mochi.example",
    token: "exemple-de-code-personnel",
  });
});

test("un stockage corrompu ou une adresse avec identifiants ne réactive pas le vocal", () => {
  for (const raw of [
    null,
    "",
    "{",
    JSON.stringify({ url: "https://mochi.example", token: "court" }),
    JSON.stringify({
      url: "https://user:password@mochi.example",
      token: "exemple-de-code-personnel",
    }),
    JSON.stringify({
      url: "https://mochi.example?token=secret",
      token: "exemple-de-code-personnel",
    }),
  ])
    assert.equal(readStoredConnection(raw), null);
});
