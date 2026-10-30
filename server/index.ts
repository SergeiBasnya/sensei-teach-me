import { createApp, createProvider } from "./app";
import { createLocalSpeech } from "./local-speech";
import { createLocalTutor, type LabGeneration } from "./local-tutor";
import { createVoiceLab } from "./voice-lab";
import { createVoiceLabAsr } from "./voice-lab-asr";
import { createVoiceLabResponse } from "./voice-lab-response";
import { createVoiceLabSampleStore } from "./voice-lab-samples";

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
const origins: string[] = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
      .map((value: string) => value.trim())
      .filter(Boolean)
  : ["http://localhost:8081", "http://127.0.0.1:8081"];
const labAsr =
  process.env.SENSEI_VOICE_LAB === "1" && local && speech
    ? createVoiceLabAsr()
    : undefined;
const labGeneration: LabGeneration =
  process.env.SENSEI_LAB_GENERATION === "ja-first"
    ? "ja-first"
    : process.env.SENSEI_LAB_GENERATION === "compact"
      ? "compact"
      : "structured";
const voiceLab =
  labAsr && local && speech
    ? createVoiceLab({
        transcribe: labAsr.transcribe,
        respond: createVoiceLabResponse(local, speech, {
          turn: (input, options) =>
            local.labTurn(input, labGeneration, options),
          ...(labGeneration === "ja-first"
            ? {
                details: ({ japanese, history, signal }) =>
                  local.labDetails({ japanese, history }, signal),
              }
            : {}),
        }),
        ready: () => local.ready(),
        retainSample: createVoiceLabSampleStore(),
      })
    : undefined;
const app = createApp({
  voiceLab,
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
  origins,
});
const server = app.listen(port, host, () => {
  process.stdout.write(
    `Serveur Sensei sur le port ${port}. ${local ? "Moteurs locaux en préparation." : provider ? "Fournisseur OpenAI explicite." : "Moteurs locaux à installer."}\n`,
  );
});
voiceLab?.attach(server, { origins });
function shutdown() {
  voiceLab?.close();
  labAsr?.close();
  speech?.close();
  local?.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
