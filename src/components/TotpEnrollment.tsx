import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface TotpEnrollmentProps { secret: string; otpauthUri: string }

/** First sign-in: the authenticator QR is drawn here, in the browser; the secret never leaves the page. */
export function TotpEnrollment({ secret, otpauthUri }: TotpEnrollmentProps) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    if (!otpauthUri.startsWith('otpauth://totp/')) return undefined;
    QRCode.toString(otpauthUri, { type: 'svg', margin: 1, width: 192, errorCorrectionLevel: 'M' })
      .then((markup) => { if (!cancelled) setSvg(markup); })
      .catch(() => { if (!cancelled) setSvg(null); });
    return () => { cancelled = true; };
  }, [otpauthUri]);

  return (
    <div className="totp-enrollment" role="status">
      <strong>Conecta tu app de autenticación (solo se muestra una vez)</strong>
      {svg && <div className="totp-qr" role="img" aria-label="Código QR para tu app de autenticación"
        dangerouslySetInnerHTML={{ __html: svg }} />}
      <p>{svg ? 'Escanéalo con tu app de autenticación (Microsoft Authenticator, Google Authenticator…) y escribe el código de 6 dígitos.'
        : 'Agrega esta clave en tu app de autenticación y escribe el código de 6 dígitos.'}</p>
      <details>
        <summary>No puedo escanear</summary>
        <code aria-label="Clave TOTP">{secret}</code>
      </details>
    </div>
  );
}
