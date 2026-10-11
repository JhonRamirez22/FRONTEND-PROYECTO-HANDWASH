import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConnectionStore } from '@/stores/connectionStore';

const statusConfig = {
  connected: {
    label: 'Conectado',
    icon: Wifi,
    dotClass: 'bg-success',
    bgClass: 'bg-success/10 text-success border-success/20',
  },
  reconnecting: {
    label: 'Reconectando',
    icon: RefreshCw,
    dotClass: 'bg-warning animate-pulse-slow',
    bgClass: 'bg-warning/10 text-warning border-warning/20',
  },
  disconnected: {
    label: 'Desconectado',
    icon: WifiOff,
    dotClass: 'bg-destructive',
    bgClass: 'bg-destructive/10 text-destructive border-destructive/20',
  },
} as const;

export function ConnectionStatusBadge() {
  const { status, reconnectAttempts } = useConnectionStore();
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200',
        config.bgClass
      )}
      role="status"
      aria-label={`Estado de conexion: ${config.label}`}
    >
      <span className={cn('h-2 w-2 rounded-full', config.dotClass)} />
      <Icon className="h-3.5 w-3.5" />
      <span>{config.label}</span>
      {status === 'reconnecting' && (
        <span className="text-xs opacity-70 font-bold">
          ({reconnectAttempts})
        </span>
      )}
    </div>
  );
}
