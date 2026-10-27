import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  meshAvatarState,
  meshStateSchema,
  meshEventSchema,
  meshStateScript,
  isAvatarNavigation,
} from "../src/lib/mesh-avatar-protocol";
import { voiceLevelAt } from "../src/lib/speech-energy";

test("le niveau vocal reste continu et les pauses, l’inactivité et les valeurs invalides ferment la bouche", () => {
  const energy = { step: 0.08, duration: 0.24, levels: [0, 0.27, 0.86] };
  assert.equal(voiceLevelAt(energy, 0.1), 0.27);
  assert.equal(voiceLevelAt(energy, 0.2), 0.86);
  assert.equal(voiceLevelAt(energy, 0.24), 0);
  assert.equal(meshAvatarState("speaking", 0.27, true, false).level, 0.27);
  assert.equal(meshAvatarState("idle", 0.8, true, false).level, 0);
  assert.equal(meshAvatarState("speaking", 0.8, false, false).level, 0);
  assert.equal(meshAvatarState("speaking", NaN, true, false).level, 0);
  assert.equal(meshAvatarState("speaking", 4, true, false).level, 1);
  assert.equal(
    meshAvatarState("speaking", 0.2, true, true).level,
    meshAvatarState("speaking", 0.9, true, true).level,
  );
});

test("le pont de l’avatar refuse les états invalides, les messages arbitraires et les navigations externes", () => {
  const state = meshAvatarState("listening", 0, true, false);
  assert.equal(
    meshStateSchema.safeParse({ ...state, level: Infinity }).success,
    false,
  );
  assert.equal(
    meshStateSchema.safeParse({ ...state, mood: "<script>" }).success,
    false,
  );
  assert.equal(
    meshEventSchema.safeParse({ type: "open-url", version: 1 }).success,
    false,
  );
  assert.equal(
    meshEventSchema.safeParse({ type: "mochi:ready", version: 2 }).success,
    false,
  );
  assert.equal(
    meshEventSchema.safeParse({ type: "mochi:ready", version: 1 }).success,
    true,
  );
  assert.ok(meshStateScript(state).endsWith(";true;"));
  for (const url of [
    "https://example.com",
    "file:///secret",
    "javascript:alert(1)",
    "about:blank#external",
  ])
    assert.equal(isAvatarNavigation(url), false);
  assert.equal(isAvatarNavigation("about:blank"), true);
});

test("l’archive Mesh Avatar est autonome, valide et contient exactement le visage B original", async () => {
  const { unpackAvatar, validateAvatarFiles } = await import("mesh-avatar");
  const files = unpackAvatar(
    readFileSync("assets/avatar/mesh-b/mochi-b.mavatar"),
  );
  assert.deepEqual(validateAvatarFiles(files), []);
  assert.deepEqual(
    Buffer.from(files["source.png"]!),
    readFileSync("assets/avatar/manga-b.png"),
  );
  const rig = JSON.parse(Buffer.from(files["rig.json"]!).toString());
  assert.deepEqual(rig.image, { width: 1254, height: 1254 });
  assert.equal(rig.eyes.length, 2);
  assert.ok(files["built/base.png"]!.length > 0);
  assert.ok(files["built/hairmask.png"]!.length > 0);
  assert.ok(Object.keys(files).every((path) => !path.includes("miko")));
});
