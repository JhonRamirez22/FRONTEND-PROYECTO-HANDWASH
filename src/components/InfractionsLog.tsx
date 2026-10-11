import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { useSessionStore } from '@/stores/sessionStore';
import { STEP_LABELS } from '@/types';
import type { HandWashStep } from '@/types';
import { cn } from '@/lib/utils';

export function InfractionsLog() {
  const infractions = useSessionStore((s) => s.infractions);
  const isActive = useSessionStore((s) => s.isActive);
  const summary = useSessionStore((s) => s.summary);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="neumorphic rounded-2xl p-5">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-destructive" />
          <h2 className="font-heading text-lg font-semibold text-card-foreground">
            Infracciones
          </h2>
        </div>
        {infractions.length > 0 && (
          <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-destructive px-2 text-xs font-bold text-destructive-foreground">
            {infractions.length}
          </span>
        )}
      </div>

      {infractions.length === 0 ? (
        <div className={cn(
          'rounded-xl px-4 py-8 text-center',
          isActive ? 'bg-success/5 border border-success/20' : 'bg-muted/50'
        )}>
          <div className={cn(
            'mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full',
            isActive ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
          )}>
            <ShieldAlert className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            {isActive
              ? 'Sin infracciones detectadas'
              : summary ? 'Sin infracciones en la sesión finalizada'
                : 'Inicie una sesión para ver infracciones'}
          </p>
        </div>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {infractions.map((infraction, index) => (
            <div
              key={`${infraction.timestamp}-${index}`}
              className="group flex items-start gap-3 rounded-xl border border-destructive/15 bg-destructive/5 p-3 transition-all duration-200 hover:bg-destructive/10 hover:border-destructive/25"
            >
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-destructive/15 text-destructive transition-transform group-hover:scale-110">
                <AlertTriangle className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-destructive">
                    {STEP_LABELS[infraction.step as HandWashStep] ?? infraction.step}
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono font-bold text-muted-foreground">
                    {formatTime(infraction.timestamp)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {infraction.motivo}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
