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
  };
}

const BLUE = '#5b9cf0';
const LABEL = '#1d5fbf';

/** Draws the PC's boxes and landmarks over a picture shown at ``width`` x ``height``. */
export function drawOverlay(ctx: CanvasRenderingContext2D, overlay: Overlay, width: number, height: number): void {
  if (!overlay.hands.length) return;
  const sx = width / overlay.w;
  const sy = height / overlay.h;
  ctx.save();
  ctx.lineWidth = Math.max(2, Math.round(width / 320));
  ctx.strokeStyle = BLUE;
  ctx.font = `${Math.max(12, Math.round(width / 54))}px system-ui, sans-serif`;
  for (const hand of overlay.hands) {
    const [x1, y1, x2, y2] = hand.b;
    ctx.strokeRect(x1 * sx, y1 * sy, (x2 - x1) * sx, (y2 - y1) * sy);
    ctx.fillStyle = BLUE;
    for (let i = 0; i + 1 < hand.k.length; i += 2) {
      ctx.beginPath();
      ctx.arc(hand.k[i]! * sx, hand.k[i + 1]! * sy, Math.max(2, ctx.lineWidth), 0, Math.PI * 2);
      ctx.fill();
    }
    const label = `Mano ${hand.c.toFixed(2)}`;
    const labelWidth = ctx.measureText(label).width + 10;
    const top = Math.max(0, y1 * sy - 22);
    ctx.fillStyle = LABEL;
    ctx.fillRect(x1 * sx, top, labelWidth, 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x1 * sx + 5, top + 15);
  }
  ctx.restore();
}
