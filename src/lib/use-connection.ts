import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { healthSchema } from "../../shared/contracts";
import {
  apiRequest,
  connectLocalPreview,
  defaultApiUrl,
  type Connection,
} from "./api";
import {
  connectionConfigSchema,
  initialServerUrl,
  readStoredConnection,
  type ConnectionConfig,
} from "./connection-config";

const KEY = "sensei.connection.v1";
export type ConnectionStatus =
  "checking" | "ready" | "partial" | "offline" | "empty";
export function useConnection() {
  const [connection, setVerified] = useState<Connection | null>(null);
  const [saved, setSaved] = useState<ConnectionConfig | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("checking");
  const [error, setError] = useState("");
  const configured = useRef<ConnectionConfig | null>(null);
  const alive = useRef(true);
  const manual = useRef(false);
  const automaticWeb = useRef(false);
  const sequence = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const writes = useRef(Promise.resolve());
  const suggestedUrl = initialServerUrl(
    Platform.OS === "web" ? "web" : "native",
    defaultApiUrl,
    Constants.expoConfig?.hostUri,
  );
  const reconnect = useCallback(async (): Promise<boolean> => {
    const id = ++sequence.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const current = () =>
      alive.current && sequence.current === id && !controller.signal.aborted;
    setStatus("checking");
    setVerified(null);
    setError("");
    try {
      let next: Connection | null = configured.current;
      if (Platform.OS === "web" && (!next || automaticWeb.current)) {
        const local = await connectLocalPreview(controller.signal);
        if (local) {
          next = local;
          automaticWeb.current = true;
        }
      }
      if (!current()) return false;
      if (!next) {
        setStatus("empty");
        setVerified(null);
        return false;
      }
      const health = healthSchema.parse(
        await apiRequest(next, "/api/health", undefined, controller.signal),
      );
      if (!current()) return false;
      if (!health.ready)
        throw new Error(
          health.warming
            ? "Mochi démarre. La connexion sera réessayée automatiquement."
            : "Les moteurs de Mochi ne sont pas prêts sur le serveur.",
        );
      const verified: Connection = {
        ...next,
        mode: health.mode === "openai" ? "openai" : "local",
        oral: health.oral,
      };
      configured.current = connectionConfigSchema.parse(verified);
      setSaved(configured.current);
      setVerified(verified);
      setStatus(health.oral ? "ready" : "partial");
      return true;
    } catch (cause) {
      if (current()) {
        setVerified(null);
        setStatus("offline");
        setError(
          cause instanceof Error
            ? cause.message
            : "Mochi n’est pas joignable pour le moment.",
        );
      }
      return false;
    }
  }, []);
  const setConnection = useCallback((next: Connection | null) => {
    manual.current = true;
    automaticWeb.current = false;
    sequence.current++;
    abort.current?.abort();
    const config = next ? connectionConfigSchema.parse(next) : null;
    configured.current = config;
    setSaved(config);
    setVerified(next);
    setStatus(next ? (next.oral ? "ready" : "partial") : "empty");
    setError("");
    if (Platform.OS !== "web")
      writes.current = writes.current
        .then(async () => {
          if (config)
            await SecureStore.setItemAsync(KEY, JSON.stringify(config), {
              keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
            });
          else await SecureStore.deleteItemAsync(KEY);
        })
        .catch(() => {
          if (alive.current)
            setError(
              "La connexion fonctionne, mais ne peut pas être mémorisée sur cet appareil.",
            );
        });
  }, []);
  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const restore = async () => {
      if (Platform.OS !== "web") {
        try {
          const raw = await SecureStore.getItemAsync(KEY);
          if (!alive.current || manual.current) return;
          const config = readStoredConnection(raw);
          configured.current = config;
          setSaved(config);
        } catch {
          if (alive.current && !manual.current) {
            setStatus("empty");
            setError(
              "La connexion mémorisée est indisponible. Tu peux reconnecter Mochi dans les réglages.",
            );
          }
          return;
        }
      }
      let attempts = 0;
      const connect = async () => {
        if (!alive.current || manual.current) return;
        const ready = await reconnect();
        if (
          !ready &&
          alive.current &&
          !manual.current &&
          ++attempts < 20 &&
          (configured.current || Platform.OS === "web")
        )
          timer = setTimeout(() => void connect(), 3000);
      };
      await connect();
    };
    void restore();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && configured.current) void reconnect();
      if (state !== "active") {
        abort.current?.abort();
        sequence.current++;
      }
    });
    return () => {
      alive.current = false;
      sequence.current++;
      abort.current?.abort();
      clearTimeout(timer);
      subscription.remove();
    };
  }, [reconnect]);
  return {
    connection,
    saved,
    status,
    error,
    suggestedUrl,
    setConnection,
    reconnect,
  };
}
