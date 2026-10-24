import { createApp, createProvider } from "./app";
import { createLocalSpeech } from "./local-speech";
import { createLocalTutor } from "./local-tutor";

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT doit être compris entre 1 et 65535.");
const speech = createLocalSpeech();
// Un fournisseur payant n’est activé que par un choix explicite. Aucun repli payant.
const paid = process.env.SENSEI_PROVIDER === "openai";
const local = paid ? undefined : createLocalTutor();
const provider =
  paid && process.env.OPENAI_API_KEY
    ? createProvider(process.env.OPENAI_API_KEY)
    : local;
const app = createApp({
  speech,
  token: process.env.SENSEI_ACCESS_TOKEN,
  provider,
  mode: local ? "local" : paid && provider ? "openai" : "unavailable",
  isReady: () => (local ? local.ready() : !!provider),
  localPreview:
    // En LAN aussi, /api/local-session vérifie le pair en boucle locale.
    // Le téléphone doit toujours fournir le code personnel.
    process.env.SENSEI_LOCAL_PREVIEW === "1" &&
    ["127.0.0.1", "0.0.0.0"].includes(host),
  origins: process.env.ALLOWED_ORIGINS?.split(",")
    .map((value: string) => value.trim())
    .filter(Boolean),
});
const server = app.listen(port, host, () => {
  process.stdout.write(
    `Serveur Sensei sur le port ${port}. ${local ? "Moteurs locaux en préparation." : provider ? "Fournisseur OpenAI explicite." : "Moteurs locaux à installer."}\n`,
  );
});
function shutdown() {
  speech?.close();
  local?.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
