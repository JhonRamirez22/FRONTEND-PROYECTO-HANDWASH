import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../components/AppShell';

describe('AppShell', () => {
  it('uses the supplied brand asset and exposes only the operator workspace', () => {
    render(
      <AppShell role="OPERATOR" roles={['OPERATOR']} active="station" environmentLabel="Entorno de desarrollo">
        <h1>Estación en vivo</h1>
      </AppShell>,
    );

    const brand = screen.getByRole('link', { name: 'HandWash, inicio' });
    expect(brand.querySelector('img')).toHaveAttribute('src', '/handwash-logo.png');
    expect(brand.querySelector('img')).toHaveAttribute('alt', '');
    expect(screen.getByRole('link', { name: 'Estación en vivo' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Auditoría' })).not.toBeInTheDocument();
    expect(screen.getByText('Sin aprobación clínica')).toBeInTheDocument();
  });

  it('keeps audit navigation available only to an ADMIN role', () => {
    render(
      <AppShell role="ADMIN" roles={['ADMIN']} active="audit" environmentLabel="Entorno no verificado">
        <h1>Auditoría</h1>
      </AppShell>,
    );

    expect(screen.getByRole('link', { name: 'Auditoría' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Estación en vivo' })).not.toBeInTheDocument();
    expect(screen.getByText('Entorno no verificado')).toBeInTheDocument();
  });

  it('renders the public station without navigation or visible human roles', () => {
    render(
      <AppShell role="OPERATOR" roles={[]} active="station" publicStation>
        <h1>Puesto público</h1>
      </AppShell>,
    );

    expect(screen.getByRole('heading', { name: 'Puesto público' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'HandWash, puesto' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByText(/Operador|Administrador|Auditoría/)).not.toBeInTheDocument();
  });
});
