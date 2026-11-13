/** Step 1-6 from a Java step code such as PASO_3_INTERDIGITALES; null for anything else. */
export function stepNumber(code: string): number | null {
  const match = /^PASO[_ ]?([1-6])(?:_|$)/i.exec(code);
  return match ? Number(match[1]) : null;
}
