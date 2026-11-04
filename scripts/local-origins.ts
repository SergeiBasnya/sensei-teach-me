import { networkInterfaces } from "node:os";

/** Exact origins of this development host; never trust an incoming Host header. */
export function localOrigins(
  lan: boolean,
  interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces(),
) {
  const hosts = new Set(["localhost", "127.0.0.1"]);
  if (lan)
    for (const addresses of Object.values(interfaces))
      for (const address of addresses ?? [])
        if (address.family === "IPv4" && !address.internal)
          hosts.add(address.address);
  return [...hosts].flatMap((host) =>
    [8787, 8081, 8082, 8083].map((port) => `http://${host}:${port}`),
  );
}
