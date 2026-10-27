import { build } from "esbuild";
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";

async function main() {
  const { packAvatar, validateAvatarFiles } = await import("mesh-avatar");
  const root = resolve("assets/avatar/mesh-b");
  const rig = JSON.parse(
    await readFile(resolve(root, "rig.json"), "utf8"),
  ) as unknown;
  const meta = JSON.parse(
    await readFile(resolve(root, "built/layers.json"), "utf8"),
  ) as { layers: Record<string, unknown> };
  const names = [
    "base.png",
    "hairmask.png",
    "layers.json",
    ...Object.keys(meta.layers).map((name) => `${name}.png`),
  ];
  const files: Record<string, Uint8Array> = {};
  const assets: Record<string, string> = {};
  for (const name of names) {
    const data = await readFile(resolve(root, "built", name));
    files[`built/${name}`] = data;
    assets[name] =
      `data:${name.endsWith("json") ? "application/json" : "image/png"};base64,${data.toString("base64")}`;
  }
  files["rig.json"] = await readFile(resolve(root, "rig.json"));
  files["avatar.json"] = await readFile(resolve(root, "avatar.json"));
  files["source.png"] = await readFile("assets/avatar/manga-b.png");
  const errors = validateAvatarFiles(files);
  if (errors.length) throw new Error(errors.join("\n"));
  const archivePath = resolve(root, "mochi-b.mavatar");
  await writeFile(`${archivePath}.${process.pid}.tmp`, packAvatar(files));
  await rename(`${archivePath}.${process.pid}.tmp`, archivePath);
  const bundle = await build({
    entryPoints: ["scripts/mesh-avatar-player.ts"],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: ["chrome100", "safari15"],
    minify: true,
    legalComments: "inline",
    pure: ["console.warn"],
    define: {
      MOCHI_RIG: JSON.stringify(rig),
      MOCHI_ASSETS: JSON.stringify(assets),
    },
  });
  const code = bundle.outputFiles[0]!.text.replace(/<\/script/gi, "<\\/script");
  const license = await readFile("node_modules/mesh-avatar/LICENSE", "utf8");
  const zipLicense = await readFile("node_modules/fflate/LICENSE", "utf8");
  const html = `<!doctype html>
<!-- Mesh Avatar 0.3.0 | ${license}\nfflate: ${zipLicense} -->
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src data: blob:; base-uri 'none'; form-action 'none'">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}canvas{display:block;width:100%;height:100%}</style>
</head><body><canvas aria-hidden="true"></canvas><script>${code}</script></body></html>`;
  const htmlPath = "assets/avatar/mochi-mesh.html";
  await writeFile(`${htmlPath}.${process.pid}.tmp`, html);
  await rename(`${htmlPath}.${process.pid}.tmp`, htmlPath);
  console.info(
    `Mesh Avatar B : ${names.length} assets, ${Math.round(Buffer.byteLength(html) / 1024)} KiB, archive validée.`,
  );
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
