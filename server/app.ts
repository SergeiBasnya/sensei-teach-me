import { timingSafeEqual } from "node:crypto";
import express, { type ErrorRequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  audioRequestSchema,
  turnRequestSchema,
  tutorReplySchema,
  type TutorReply,
} from "../shared/contracts";

export interface TutorProvider {
  turn: (input: typeof turnRequestSchema._output) => Promise<TutorReply>;
  transcribe: (input: typeof audioRequestSchema._output) => Promise<string>;
}
export function createProvider(apiKey: string): TutorProvider {
  const client = new OpenAI({ apiKey, timeout: 35_000, maxRetries: 0 });
  return {
    async turn(input) {
      const response = await client.responses.parse({
        model: process.env.OPENAI_CHAT_MODEL || "gpt-4.1-mini",
        store: false,
        max_output_tokens: 1000,
        instructions: `Tu es Mochi, un tuteur de japonais pour un adulte francophone tout débutant (avant JLPT N5). Scénario : ${input.scenario}. Reste dans cette situation, réponds naturellement en japonais poli très simple en une ou deux phrases courtes, puis pose une seule petite question. Fournis la lecture romaji exacte et une traduction française naturelle dans reply. Accepte le français et le romaji pour aider à démarrer. N'invente pas d'erreur : correction est null si la phrase est acceptable ; sinon recopie la phrase originale complète, propose une correction et une courte explication française bienveillante. Ne juge jamais la prononciation à partir du texte ou d'une transcription. Donne au maximum deux expressions courtes utiles dans vocabulary avec romaji et français. Ne prétends pas enregistrer de données ni connaître des séances précédentes.`,
        input: [
          ...input.history,
          { role: "user" as const, content: input.text },
        ],
        text: { format: zodTextFormat(tutorReplySchema, "japanese_tutor") },
      });
      if (!response.output_parsed) throw new Error("empty_reply");
      return tutorReplySchema.parse(response.output_parsed);
    },
    async transcribe(input) {
      const bytes = Buffer.from(input.audio, "base64");
      if (bytes.length < 100 || bytes.length > 9_000_000)
        throw new Error("invalid_audio");
      const result = await client.audio.transcriptions.create({
        model: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-transcribe",
        file: await toFile(bytes, `response.${input.format}`, {
          type: input.format === "m4a" ? "audio/mp4" : `audio/${input.format}`,
        }),
      });
      return result.text.trim();
    },
  };
}
export function createApp({
  token,
  provider,
  origins = ["http://localhost:8081", "http://127.0.0.1:8081"],
}: {
  token?: string;
  provider?: TutorProvider;
  origins?: string[];
}) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin)) {
      res.status(403).json({
        error: "Cette origine web n’est pas autorisée par le serveur.",
      });
      return;
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: "Trop de demandes. Patiente une minute avant de réessayer.",
      },
    }),
  );
  app.use("/api", (req, res, next) => {
    if (
      !token ||
      token.length < 16 ||
      token === "replace-with-a-long-random-personal-token"
    ) {
      res.status(503).json({
        error:
          "Configure un code personnel SENSEI_ACCESS_TOKEN d’au moins 16 caractères sur le serveur.",
      });
      return;
    }
    const provided = Buffer.from(
      req.headers.authorization?.replace(/^Bearer /, "") || "",
    );
    const expected = Buffer.from(token);
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      res.status(401).json({
        error: "Code personnel incorrect. Vérifie le code dans les réglages.",
      });
      return;
    }
    next();
  });
  app.get("/api/health", (_req, res) => {
    res.json({ ready: !!provider });
  });
  app.use("/api", express.json({ limit: "13mb" }));
  app.post("/api/turn", async (req, res) => {
    const parsed = turnRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error:
          "La conversation doit contenir une phrase et au plus 16 messages de contexte.",
      });
      return;
    }
    if (!provider) {
      res.status(503).json({
        error:
          "Ajoute la clé OPENAI_API_KEY sur le serveur pour activer la conversation.",
      });
      return;
    }
    const reply = await provider.turn(parsed.data);
    res.json(tutorReplySchema.parse(reply));
  });
  app.post("/api/transcribe", async (req, res) => {
    const parsed = audioRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error:
          "Format audio non pris en charge ou enregistrement trop volumineux.",
      });
      return;
    }
    if (!provider) {
      res.status(503).json({
        error:
          "Ajoute la clé OPENAI_API_KEY sur le serveur pour activer le micro.",
      });
      return;
    }
    res.json({ text: await provider.transcribe(parsed.data) });
  });
  app.use((_req, res) => {
    res.status(404).json({ error: "Route inconnue." });
  });
  const errorHandler: ErrorRequestHandler = (
    error: unknown,
    _req,
    res,
    _next,
  ) => {
    if (error instanceof OpenAI.APIError && error.status === 429) {
      res.status(429).json({
        error:
          "Le quota du fournisseur IA est atteint. Vérifie ton compte OpenAI.",
      });
      return;
    }
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? error.status
        : undefined;
    if (status === 413) {
      res.status(413).json({
        error: "Enregistrement trop volumineux. Essaie une phrase plus courte.",
      });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: "Le format de la demande est invalide." });
      return;
    }
    res.status(502).json({
      error:
        "Le service IA n’a pas pu répondre. Vérifie la clé, le modèle et la connexion du serveur, puis réessaie.",
    });
  };
  app.use(errorHandler);
  return app;
}
