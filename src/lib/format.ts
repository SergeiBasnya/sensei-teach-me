export function formatDuration(seconds: number) {
  return seconds < 60
    ? `${seconds} s`
    : `${Math.floor(seconds / 60)} min ${seconds % 60 ? String(seconds % 60) + " s" : ""}`;
}
