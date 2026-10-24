import { tutorReplySchema, type ScenarioId } from "../../shared/contracts";

export type Connection = { url: string; token: string };
export const defaultApiUrl =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:8787";
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
  const timer = setTimeout(cancel, 45_000);
  try {
    const response = await fetch(`${validServerUrl(connection.url)}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${connection.token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const result: unknown = await response.json();
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
) {
  return tutorReplySchema.parse(
    await apiRequest(
      connection,
      "/api/turn",
      { scenario, history: history.slice(-16), text },
      signal,
    ),
  );
}
