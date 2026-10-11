import type { ReactNode } from 'react';
import { ClipboardList, LayoutDashboard, LogOut, ShieldCheck } from 'lucide-react';
import type { HumanRole } from '@/lib/CognitoAdminAuthService';

interface AppShellProps {
  role: HumanRole;
  roles: HumanRole[];
  active: 'station' | 'audit';
  onSignOut?: () => void;
  status?: ReactNode;
  environmentLabel?: string;
  children: ReactNode;
}

export function AppShell({ role, roles, active, onSignOut, status,
  environmentLabel = 'Entorno no verificado', children }: AppShellProps) {
  const canOperate = roles.includes('OPERATOR');
  const canAudit = roles.includes('ADMIN');

  return (
    <div className="app-frame">
      <aside className="app-sidebar" aria-label="Navegación principal">
        <a className="brand-lockup" href="#/" aria-label="HandWash, inicio">
          <span className="brand-mark"><img src="/handwash-logo.png" alt="" /></span>
          <span><strong>HandWash</strong><small>Estación de verificación</small></span>
        </a>

        <div className="sidebar-section-label">Espacio de trabajo</div>
        <nav className="primary-nav">
          {canOperate && (
            <a href="#/" aria-current={active === 'station' ? 'page' : undefined}
              className={`nav-link ${active === 'station' ? 'is-active' : ''}`}>
              <LayoutDashboard size={17} /><span>Estación en vivo</span>
            </a>
          )}
          {canAudit && (
            <a href="#/admin" aria-current={active === 'audit' ? 'page' : undefined}
              className={`nav-link ${active === 'audit' ? 'is-active' : ''}`}>
              <ClipboardList size={17} /><span>Auditoría</span>
            </a>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="role-chip"><ShieldCheck size={15} />{role === 'ADMIN' ? 'Administrador' : 'Operador'}</div>
          <p>Acceso y decisiones gestionados por Java.</p>
        </div>
      </aside>

      <div className="app-workspace">
        <header className="app-topbar">
          <div className="topbar-context">
            <span>{environmentLabel}</span>
            <span className="topbar-separator">/</span>
            <span>{active === 'audit' ? 'Solo lectura' : 'Operación'}</span>
          </div>
          <div className="topbar-actions">
            {status}
            {onSignOut && (
              <button className="button-quiet" type="button" onClick={onSignOut}>
                <LogOut size={16} /><span>Cerrar sesión</span>
              </button>
            )}
          </div>
        </header>
        <main className="app-content">{children}</main>
        <footer className="app-footer">
          <span><ShieldCheck size={14} /> Sin aprobación clínica</span>
          <span>Solo se muestran datos recibidos del sistema.</span>
        </footer>
      </div>
    </div>
  );
}
