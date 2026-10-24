import { createApp, createProvider } from "./app";
import { createLocalSpeech } from "./local-speech";

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT doit être compris entre 1 et 65535.");
const speech = createLocalSpeech();
const app = createApp({
  speech,
  token: process.env.SENSEI_ACCESS_TOKEN,
  provider: process.env.OPENAI_API_KEY
    ? createProvider(process.env.OPENAI_API_KEY)
    : undefined,
  origins: process.env.ALLOWED_ORIGINS?.split(",")
    .map((value: string) => value.trim())
    .filter(Boolean),
});
const server = app.listen(port, host, () => {
  process.stdout.write(
    `Serveur Sensei prêt sur le port ${port}. IA ${process.env.OPENAI_API_KEY ? "configurée" : "à configurer"}.\n`,
  );
});
function shutdown() {
  speech?.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
