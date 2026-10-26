import { z } from "zod";
import { validServerUrl } from "./api";

export const connectionConfigSchema = z
  .object({
    url: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .refine((value) => {
        try {
          validServerUrl(value);
          return true;
        } catch {
          return false;
        }
      }, "Adresse de Mochi invalide."),
    token: z.string().trim().min(16).max(512),
  })
  .transform((value) => ({
    url: validServerUrl(value.url),
    token: value.token,
  }));
export type ConnectionConfig = z.infer<typeof connectionConfigSchema>;
export function readStoredConnection(
  raw: string | null,
): ConnectionConfig | null {
  if (!raw) return null;
  try {
    const result = connectionConfigSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
export function isLoopbackUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname;
    return (
      hostname === "localhost" ||
      /^127\./.test(hostname) ||
      ["[::1]", "::1", "0.0.0.0"].includes(hostname)
    );
  } catch {
    return false;
  }
}
export function initialServerUrl(
  platform: "web" | "native",
  apiUrl: string,
  hostUri?: string | null,
): string {
  if (platform === "web") return apiUrl;
  try {
    if (!isLoopbackUrl(apiUrl)) return validServerUrl(apiUrl);
  } catch {
    /* Adresse de développement non configurée. */
  }
  if (hostUri) {
    try {
      const host = new URL(
        hostUri.includes("://") ? hostUri : `http://${hostUri}`,
      );
      if (
        !isLoopbackUrl(host.toString()) &&
        ["http:", "https:"].includes(host.protocol)
      ) {
        host.port = "8787";
        host.pathname = "/";
        host.search = "";
        host.hash = "";
        return validServerUrl(host.toString());
      }
    } catch {
      /* Une installation autonome demandera son adresse de connexion. */
    }
  }
  return "";
}
