import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import { initialProgress, progressSchema, type Progress } from "./progress";

const STORAGE_KEY = "sensei:progress:v2";
export function useProgress() {
  const [progress, setProgress] = useState<Progress>(initialProgress);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState("");
  const writable = useRef(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(
        async (raw) =>
          raw ?? (await AsyncStorage.getItem("sensei:progress:v1")),
      )
      .then((raw) => {
        const next = raw
          ? progressSchema.parse(JSON.parse(raw))
          : initialProgress;
        if (mounted) {
          setProgress(next);
          writable.current = true;
        }
      })
      .catch(() => {
        if (mounted)
          setStorageError(
            "La sauvegarde locale est indisponible. Tes données existantes sont conservées ; les changements de cette session ne seront pas enregistrés.",
          );
      })
      .finally(() => {
        if (mounted) setLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (!loaded || !writable.current) return;
    const snapshot = JSON.stringify(progress);
    writes.current = writes.current
      .then(() => AsyncStorage.setItem(STORAGE_KEY, snapshot))
      .catch(() =>
        setStorageError(
          "La dernière sauvegarde a échoué. Garde l’application ouverte et vérifie le stockage de ton appareil.",
        ),
      );
  }, [loaded, progress]);
  return { progress, setProgress, loaded, storageError };
}
