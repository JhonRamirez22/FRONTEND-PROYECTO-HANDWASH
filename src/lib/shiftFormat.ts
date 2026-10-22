export const SHIFT_HOURS = [4, 8, 10, 12] as const;

/** "7 h 12 min" / "35 min"; never negative. */
export function formatRemaining(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}
