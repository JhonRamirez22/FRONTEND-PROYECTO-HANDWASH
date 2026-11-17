import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrImageProps { value: string; label: string; size?: number }

/** Draws a QR locally in the browser. Only https links are drawn: nothing else is worth scanning here. */
export function QrImage({ value, label, size = 192 }: QrImageProps) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    if (!value.startsWith('https://')) return undefined;
    QRCode.toString(value, { type: 'svg', margin: 1, width: size, errorCorrectionLevel: 'M' })
      .then((markup) => { if (!cancelled) setSvg(markup); })
      .catch(() => { if (!cancelled) setSvg(null); });
    return () => { cancelled = true; };
  }, [value, size]);

  if (!svg) return null;
  return <div className="qr-image" role="img" aria-label={label} style={{ width: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}
