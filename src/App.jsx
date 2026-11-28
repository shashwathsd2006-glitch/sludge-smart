import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import AuthGate from './components/AuthGate.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { can } from './lib/permissions.js';

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Generation = lazy(() => import('./pages/Generation.jsx'));
const Characterisation = lazy(() => import('./pages/Characterisation.jsx'));
const Handling = lazy(() => import('./pages/Handling.jsx'));
const Technology = lazy(() => import('./pages/Technology.jsx'));
const Compliance = lazy(() => import('./pages/Compliance.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const PasswordChange = lazy(() => import('./pages/PasswordChange.jsx'));

function PageFallback() {
  return <div className="page"><p className="data-status">Loading module…</p></div>;
}

function ProtectedRoute({ permission, children }) {
  const { user } = useAuth();
  return can(user, permission) ? children : <Navigate to="/" replace />;
}

function AccountRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AuthGate>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<ProtectedRoute permission="reports:read"><Dashboard /></ProtectedRoute>} />
              <Route path="/generation" element={<ProtectedRoute permission="generation:read"><Generation /></ProtectedRoute>} />
              <Route path="/characterisation" element={<ProtectedRoute permission="lab:read"><Characterisation /></ProtectedRoute>} />
              <Route path="/handling" element={<ProtectedRoute permission="handling:read"><Handling /></ProtectedRoute>} />
              <Route path="/technology" element={<ProtectedRoute permission="technology:read"><Technology /></ProtectedRoute>} />
              <Route path="/compliance" element={<ProtectedRoute permission="compliance:read"><Compliance /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute permission="reports:read"><Reports /></ProtectedRoute>} />
              <Route path="/change-password" element={<AccountRoute><PasswordChange /></AccountRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AuthGate>
      </AuthProvider>
    </HashRouter>
  );
}
