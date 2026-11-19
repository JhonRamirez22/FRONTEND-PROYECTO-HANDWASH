/** The wire format between the phone, the backend, the RTX PC and the panel. */

const SEQUENCE_BYTES = 4;
const MAX_HANDS = 4;

export interface OverlayHand {
  /** Box [x1, y1, x2, y2] in pixels of the frame the PC analysed. */
  b: [number, number, number, number];
  /** Detector confidence, 0..1. */
  c: number;
  /** Landmarks as x, y pairs in the same pixels. */
  k: number[];
}

export interface Overlay {
  seq: number;
  /** Size of the frame the PC analysed, so the panel can scale boxes to whatever it shows. */
  w: number;
  h: number;
  hands: OverlayHand[];
  step: string | null;
  conf: number | null;
  fps: number;
  /** Steps done so far in the PC's own count (0 = none yet). */
  cur: number;
  /** The step the PC is waiting for next (0 = the wash is complete). */
  exp: number;
  /** True for a moment after a step out of order: the wash starts over. */
  err: boolean;
}

export const STEP_NAMES = ['Palmas', 'Dorsos', 'Interdigitales', 'Nudillos', 'Pulgar', 'Punta de dedos'] as const;

/** What the panel says when the wash goes out of order: what was done, what was due, and that it starts over. */
export function wrongStepMessage(done: number | null, due: number): string {
  const did = done ? `hiciste el Paso ${done} · ${STEP_NAMES[done - 1]}` : 'ese movimiento no corresponde';
  const next = due > 0 ? `; tocaba el Paso ${due} · ${STEP_NAMES[due - 1]}` : '';
  return `Paso incorrecto: ${did}${next}. Se reinicia desde Palmas`;
}

/** 'Paso2_Dorsos' -> 2, anything else -> null. */
export function stepNumber(step: string | null): number | null {
  const match = /^Paso([1-6])_/.exec(step ?? '');
  return match ? Number(match[1]) : null;
}

/** A camera frame on the wire: 4-byte big-endian sequence followed by the JPEG. */
export function frameWithSequence(seq: number, jpeg: ArrayBuffer): ArrayBuffer {
  const out = new Uint8Array(SEQUENCE_BYTES + jpeg.byteLength);
  new DataView(out.buffer).setUint32(0, seq >>> 0, false);
  out.set(new Uint8Array(jpeg), SEQUENCE_BYTES);
  return out.buffer;
}

export function splitFrame(data: ArrayBuffer): { seq: number; jpeg: Blob } | null {
  if (data.byteLength < SEQUENCE_BYTES + 2) return null;
  const bytes = new Uint8Array(data);
  if (bytes[SEQUENCE_BYTES] !== 0xff || bytes[SEQUENCE_BYTES + 1] !== 0xd8) return null;
  return { seq: new DataView(data).getUint32(0, false), jpeg: new Blob([bytes.slice(SEQUENCE_BYTES)], { type: 'image/jpeg' }) };
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function parseOverlay(text: string): Overlay | null {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (!finite(raw.seq) || !finite(raw.w) || !finite(raw.h) || raw.w <= 0 || raw.h <= 0 || !Array.isArray(raw.hands)
    || raw.hands.length > MAX_HANDS) return null;
  const hands: OverlayHand[] = [];
  for (const item of raw.hands) {
    const hand = item as Record<string, unknown>;
    if (!Array.isArray(hand.b) || hand.b.length !== 4 || !hand.b.every(finite) || !finite(hand.c)
      || !Array.isArray(hand.k) || hand.k.length > 64 || !hand.k.every(finite)) return null;
    hands.push({ b: hand.b as OverlayHand['b'], c: hand.c, k: hand.k as number[] });
  }
  return {
    seq: raw.seq, w: raw.w, h: raw.h, hands,
    step: typeof raw.step === 'string' ? raw.step.slice(0, 64) : null,
    conf: finite(raw.conf) ? raw.conf : null,
    fps: finite(raw.fps) ? raw.fps : 0,
    cur: finite(raw.cur) ? Math.max(0, Math.min(6, Math.round(raw.cur))) : 0,
    exp: finite(raw.exp) ? Math.max(0, Math.min(6, Math.round(raw.exp))) : 1,
    err: raw.err === true,
  };
}

const BLUE = '#5b9cf0';
const GREEN = '#2fa36b';
const AMBER = '#e0a030';

/** Draws the PC's boxes and landmarks over a picture shown at ``width`` x ``height``. */
export function drawOverlay(ctx: CanvasRenderingContext2D, overlay: Overlay, width: number, height: number): void {
  if (!overlay.hands.length) return;
  const sx = width / overlay.w;
  const sy = height / overlay.h;
  const detected = stepNumber(overlay.step);
  // Joined hands arrive as the same box twice: one frame is enough.
  const hands = overlay.hands.filter((hand, index) => overlay.hands.findIndex((other) => other.b.every((v, i) => v === hand.b[i])) === index);
  const color = overlay.err ? AMBER : detected === null ? BLUE : GREEN;
  const text = detected === null
    ? null
    : `Paso ${detected} · ${STEP_NAMES[detected - 1]}${overlay.conf !== null ? ` ${Math.round(overlay.conf * 100)}%` : ''}`;
  ctx.save();
  ctx.lineWidth = Math.max(2, Math.round(width / 320));
  ctx.strokeStyle = color;
  ctx.font = `600 ${Math.max(12, Math.round(width / 50))}px system-ui, sans-serif`;
  for (const hand of hands) {
    const [x1, y1, x2, y2] = hand.b;
    ctx.strokeRect(x1 * sx, y1 * sy, (x2 - x1) * sx, (y2 - y1) * sy);
    ctx.fillStyle = color;
    for (let i = 0; i + 1 < hand.k.length; i += 2) {
      ctx.beginPath();
      ctx.arc(hand.k[i]! * sx, hand.k[i + 1]! * sy, Math.max(2, ctx.lineWidth), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const first = hands[0]!;
  const label = overlay.err ? wrongStepMessage(detected, overlay.exp)
    : text ?? (overlay.exp > 0 ? `Esperando: Paso ${overlay.exp} · ${STEP_NAMES[overlay.exp - 1]}` : `Mano ${first.c.toFixed(2)}`);
  const labelWidth = ctx.measureText(label).width + 12;
  const top = Math.max(0, first.b[1] * sy - 26);
  ctx.fillStyle = color;
  ctx.fillRect(first.b[0] * sx, top, labelWidth, 24);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, first.b[0] * sx + 6, top + 17);
  ctx.restore();
}
