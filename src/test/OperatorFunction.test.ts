import { describe, expect, it } from 'vitest';
import { GET, POST } from '../../api/operator';

describe('operator BFF function routing', () => {
  it('dispatches the status route while preserving authentication checks', async () => {
    const response = await GET(new Request('https://handwash.test/api/operator?action=me'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: 'AUTH_REQUIRED' });
  });

  it('rejects unknown and ambiguous actions', async () => {
    const unknown = await GET(new Request('https://handwash.test/api/operator?action=other'));
    const ambiguous = await GET(new Request('https://handwash.test/api/operator?action=me&action=claim'));

    expect(unknown.status).toBe(404);
    expect(ambiguous.status).toBe(404);
  });

  it('rejects unsupported methods for a known action', async () => {
    const response = await GET(new Request('https://handwash.test/api/operator?action=claim'));

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });

  it('dispatches writes through the existing CSRF guard', async () => {
    const response = await POST(new Request('https://handwash.test/api/operator?action=claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'invalid' }),
    }));

    expect(response.status).toBe(403);
  });
});
