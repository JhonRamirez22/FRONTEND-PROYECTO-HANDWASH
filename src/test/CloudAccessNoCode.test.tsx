import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/adminAuth', () => ({
  cognitoAdminAuth: { isConfigured: () => true, getAccessToken: () => null },
  localAdminAuth: { login: vi.fn() },
  operatorAuth: {},
}));
vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));

describe('ADMIN sign-in form', () => {
  it('asks only for user and password, no 6-digit code', async () => {
    const { CloudAccessPage } = await import('@/components/CloudAccessPage');
    render(<CloudAccessPage />);
    expect(screen.getByLabelText('Usuario')).toBeTruthy();
    expect(screen.getByLabelText('Contraseña')).toBeTruthy();
    expect(screen.queryByText(/6 dígitos/)).toBeNull();
    expect(screen.queryByLabelText(/Código/)).toBeNull();
  });
});
