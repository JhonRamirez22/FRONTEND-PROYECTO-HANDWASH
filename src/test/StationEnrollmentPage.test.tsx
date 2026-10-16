import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StationEnrollmentPage } from '../components/StationEnrollmentPage';
import { stationApi } from '../lib/StationApi';

afterEach(() => vi.restoreAllMocks());

describe('StationEnrollmentPage', () => {
  it('redeems the one-time code without showing an admin link', async () => {
    const onEnrolled = vi.fn();
    vi.spyOn(stationApi, 'enroll').mockResolvedValue({ stationId: 'station-id', stationName: 'Lavamanos A' });
    render(<StationEnrollmentPage onEnrolled={onEnrolled} onRetry={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Código de inscripción'), { target: { value: 'x'.repeat(40) } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar estación' }));

    await waitFor(() => expect(onEnrolled).toHaveBeenCalledWith('Lavamanos A'));
    expect(stationApi.enroll).toHaveBeenCalledWith('x'.repeat(40));
    expect(screen.queryByRole('link', { name: /admin|auditoría/i })).not.toBeInTheDocument();
  });

  it('does not attempt registration with a short code', () => {
    vi.spyOn(stationApi, 'enroll');
    render(<StationEnrollmentPage onEnrolled={vi.fn()} onRetry={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Código de inscripción'), { target: { value: 'short' } });
    expect(screen.getByRole('button', { name: 'Registrar estación' })).toBeDisabled();
    expect(stationApi.enroll).not.toHaveBeenCalled();
  });

  it('shows one actionable service error instead of exposing a parser detail', () => {
    render(<StationEnrollmentPage onEnrolled={vi.fn()} onRetry={vi.fn()} unavailable
      error="Failed to execute 'json' on 'Response': Unexpected end of JSON input" />);

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByText('No se pudo contactar el servicio')).toBeInTheDocument();
    expect(screen.queryByText(/Unexpected end of JSON input/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
