import { lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import AuthFrame from '../components/AuthFrame.jsx';
import Layout from '../components/Layout.jsx';
import { Panel } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const Login = lazy(() => import('../pages/Login.jsx'));

function AuthLoading({ label }) {
  return <div className="page"><p className="data-status">{label}</p></div>;
}

export default function AuthGate({ children }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'restoring') {
    return (
      <AuthFrame
        number="00"
        kicker="ACCESS / SESSION"
        title={<>RESTORING<br />SESSION</>}
        subtitle="Checking the stored token against GET /api/auth/me."
        meta={[{ label: 'STATUS', value: 'VERIFYING' }]}
      >
        <Panel label="SESSION / 01" title="PLEASE WAIT" className="auth-panel">
          <p className="panel-intro">Validating the bearer token held in this browser tab.</p>
        </Panel>
      </AuthFrame>
    );
  }

  if (location.pathname === '/login') {
    return <Suspense fallback={<AuthLoading label="Loading login…" />}><Login /></Suspense>;
  }
  return <Layout>{children}</Layout>;
}
