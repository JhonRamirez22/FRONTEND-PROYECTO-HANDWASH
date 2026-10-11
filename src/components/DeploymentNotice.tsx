import { LoaderCircle, TriangleAlert } from 'lucide-react';
import type { DeploymentStatus } from '@/lib/DeploymentStatusService';

interface DeploymentNoticeProps {
  status: DeploymentStatus;
  loading?: boolean;
  onRetry?: () => void;
}

const titles = {
  DEVELOPMENT: 'ENTORNO DE DESARROLLO: NO CLÍNICO',
  NON_CLINICAL_DEMO: 'DEMOSTRACIÓN: NO USAR CLÍNICAMENTE',
  HOSPITAL_PILOT: 'PILOTO SUPERVISADO: NO ES PRODUCCIÓN CLÍNICA',
  UNVERIFIED: 'MODO NO VERIFICADO: NO USAR CLÍNICAMENTE',
} as const;

export function DeploymentNotice({ status, loading = false, onRetry }: DeploymentNoticeProps) {
  const Icon = loading ? LoaderCircle : TriangleAlert;
  const title = loading ? 'VERIFICANDO MODO OPERATIVO' : titles[status.mode];

  return (
    <section
      role="alert"
      aria-label={title}
      className="deployment-banner flex flex-wrap items-start gap-3 px-4 py-3"
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-extrabold tracking-wide">{title}</h2>
        <p className="mt-1 break-words text-sm leading-5">{status.notice}</p>
      </div>
      {status.mode === 'UNVERIFIED' && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={loading}
          className="min-h-11 shrink-0 rounded-md border border-amber-800 px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900 disabled:cursor-wait disabled:opacity-70"
        >
          {loading ? 'Verificando…' : 'Reintentar verificación'}
        </button>
      )}
    </section>
  );
}
