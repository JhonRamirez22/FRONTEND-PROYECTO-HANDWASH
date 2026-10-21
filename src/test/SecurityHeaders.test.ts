import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface HeaderRule { source: string; headers: { key: string; value: string }[] }
const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as { headers?: HeaderRule[] };
const all = (config.headers ?? []).find((rule) => rule.source === '/(.*)')?.headers ?? [];
const header = (name: string) => all.find((item) => item.key.toLowerCase() === name.toLowerCase())?.value;

describe('ASVS V14 response headers served by Vercel', () => {
  it('sets the baseline hardening headers on every route', () => {
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(header('Strict-Transport-Security')).toMatch(/max-age=\d{7,}/);
  });

  it('allows the camera only for the page itself and nothing else powerful', () => {
    const policy = header('Permissions-Policy') ?? '';
    expect(policy).toContain('camera=(self)');
    expect(policy).toContain('microphone=()');
    expect(policy).toContain('geolocation=()');
  });

  it('ships a Content-Security-Policy in report-only mode with no inline script and no framing', () => {
    const csp = header('Content-Security-Policy-Report-Only') ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).not.toMatch(/connect-src[^;]*\s\*(\s|;|$)/);
  });

  it('keeps the operator rewrites that existed before', () => {
    expect(JSON.stringify(config)).toContain('/api/operator?action=claim');
  });
});
