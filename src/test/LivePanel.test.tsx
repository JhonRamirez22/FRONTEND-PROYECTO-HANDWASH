import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LivePanel } from '@/components/LivePanel';

describe('LivePanel', () => {
  afterEach(() => { cleanup(); window.sessionStorage.clear(); window.location.hash = ''; });

  it('asks for the ADMIN link when it is opened without one', () => {
    window.location.hash = '#/panel';
    render(<LivePanel />);
    expect(screen.getByText(/Abre el enlace que te dio ADMIN/)).toBeTruthy();
  });
});
