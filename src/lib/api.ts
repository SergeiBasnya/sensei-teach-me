import {
  tutorReplySchema,
  type LessonId,
  type ScenarioId,
} from "../../shared/contracts";
import type {
  LearnerContext,
  ReviewContext,
} from "../../shared/learning-memory";
import { responseOralMetrics, parseServerTiming } from "./oral-metrics";

export type Connection = {
  url: string;
  token: string;
  mode?: "local" | "openai";
  oral?: boolean;
};
export const defaultApiUrl =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:8787";
export async function connectLocalPreview(
  signal: AbortSignal,
): Promise<Connection | null> {
  // Le navigateur mobile distant utilise le formulaire habituel, jamais un jeton embarqué.
  if (
    typeof window === "undefined" ||
    !["localhost", "127.0.0.1"].includes(window.location.hostname)
  )
    return null;
  const base = "http://127.0.0.1:8787";
  const response = await fetch(`${base}/api/local-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
  });
  if (!response.ok) return null;
  const result: unknown = await response.json();
  if (
    typeof result !== "object" ||
    !result ||
    !("ready" in result) ||
    result.ready !== true ||
    !("token" in result) ||
    typeof result.token !== "string" ||
    result.token.length < 16
  )
    return null;
  return {
    url: base,
    token: result.token,
    mode: "local",
    oral: "oral" in result && result.oral === true,
  };
}
export function validServerUrl(raw: string): string {
  const url = new URL(raw.trim());
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Utilise une adresse HTTP ou HTTPS sans identifiants ni paramètres.",
    );
  return url.toString().replace(/\/$/, "");
}
export async function apiRequest(
  connection: Connection,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(
    cancel,
    path === "/api/health"
      ? 6000
      : path === "/api/oral-turn"
        ? 100_000
        : 85_000,
  );
  try {
    const started = performance.now();
    const response = await fetch(`${validServerUrl(connection.url)}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${connection.token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const received = performance.now();
    const raw = await response.text();
    const result: unknown = JSON.parse(raw);
    if (path === "/api/oral-turn")
      responseOralMetrics({
        requestMs: Math.round(performance.now() - started),
        responseBodyMs: Math.round(performance.now() - received),
        responseChars: raw.length,
        server: parseServerTiming(response.headers.get("server-timing")),
      });
    if (!response.ok) {
      const message =
        typeof result === "object" &&
        result !== null &&
        "error" in result &&
        typeof result.error === "string"
          ? result.error
          : "Le serveur ne répond pas. Réessaie dans un instant.";
      throw new Error(message);
    }
    return result;
  } catch (cause) {
    if (controller.signal.aborted)
      throw new Error("Le serveur a mis trop de temps à répondre. Réessaie.");
    if (cause instanceof TypeError)
      throw new Error(
        "Connexion impossible. Vérifie l’adresse du serveur et ta connexion.",
      );
    throw cause;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
export async function requestTurn(
  connection: Connection,
  scenario: ScenarioId,
  history: { role: "user" | "assistant"; content: string }[],
  text: string,
  signal?: AbortSignal,
  lessonId?: LessonId,
  guidedStepDone?: boolean,
  learning?: { learner?: LearnerContext; review?: ReviewContext },
) {
  return tutorReplySchema.parse(
    await apiRequest(
      connection,
      "/api/turn",
      {
        scenario,
        lessonId,
        guidedStepDone,
        ...learning,
        history: history.slice(-16),
        text,
      },
      signal,
    ),
  );
}
