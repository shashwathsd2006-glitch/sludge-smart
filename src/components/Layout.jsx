import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { clearLastError, getLastError, isOffline } from '../lib/api.js';
import { can, rolesLabel } from '../lib/permissions.js';

export const NAV_ITEMS = [
  { number: '01', label: 'Dashboard', path: '/', permission: 'reports:read', writePermission: null },
  { number: '02', label: 'Sludge Generation', path: '/generation', permission: 'generation:read', writePermission: 'generation:write' },
  { number: '03', label: 'Characterisation', path: '/characterisation', permission: 'lab:read', writePermission: 'lab:write' },
  { number: '04', label: 'Sludge Handling', path: '/handling', permission: 'handling:read', writePermission: 'handling:write' },
  { number: '05', label: 'Technology Selection', path: '/technology', permission: 'technology:read', writePermission: 'technology:write' },
  { number: '06', label: 'Compliance', path: '/compliance', permission: 'compliance:read', writePermission: 'compliance:write' },
  { number: '07', label: 'Reports', path: '/reports', permission: 'reports:read', writePermission: null },
];

function Sidebar({ open, onNavigate, user }) {
  const location = useLocation();
  const visibleItems = NAV_ITEMS.filter((item) => can(user, item.permission));
  const current = visibleItems.find((item) => item.path === location.pathname) || visibleItems[0];

  return (
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <NavLink to="/" className="brand" onClick={onNavigate}>
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">SLUDGE<br /><strong>SMART</strong></span>
      </NavLink>

      <div className="sidebar-caption">
        <span>INDUSTRIAL ETP</span>
        <span>SLUDGE MANAGEMENT SYSTEM</span>
        <span>VERSION 1.0 / 2026</span>
      </div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            onClick={onNavigate}
            className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : ''}`}
          >
            <span className="nav-number">{item.number}</span>
            <span className="nav-label">
              {item.label}
              {item.writePermission && !can(user, item.writePermission) && (
                <em className="nav-access">READ</em>
              )}
            </span>
            <span className="nav-arrow" aria-hidden="true">→</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-footer-label">CURRENT MODULE</div>
        <div className="sidebar-footer-value">{current.number} — {current.label.toUpperCase()}</div>
        <div className="sidebar-footer-rule" />
        <div className="sidebar-footer-note">Calculations are engineering estimates. Verify against site data and applicable regulations.</div>
      </div>
    </aside>
  );
}

export default function Layout({ children }) {
  const { user, notice, logout, dismissNotice } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [offline, setOffline] = useState(isOffline());
  const [apiError, setApiError] = useState(getLastError());
  const location = useLocation();

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    const sync = () => {
      setOffline(isOffline());
      setApiError(getLastError());
    };
    const timer = setInterval(sync, 1500);
    return () => clearInterval(timer);
  }, []);

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const today = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).toUpperCase();

  return (
    <div className="app-shell">
      <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} user={user} />
      <div className="app-main">
        <div className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="mobile-menu"
              onClick={() => setMenuOpen((value) => !value)}
              aria-label="Toggle navigation"
            >
              {menuOpen ? 'CLOSE ✕' : 'MENU ☰'}
            </button>
            <span className="topbar-brand">SLUDGE SMART</span>
            <span className="topbar-divider">/</span>
            <span className="topbar-section">ETP MONITORING &amp; ANALYSIS</span>
          </div>
          <div className="topbar-right">
            {user && <span className="user-badge" title={rolesLabel(user)}>{rolesLabel(user)} / {user.username}</span>}
            {user && <NavLink to="/change-password" className="topbar-auth">CHANGE PASSWORD</NavLink>}
            {user ? (
              <button type="button" className="topbar-auth" onClick={signOut}>SIGN OUT</button>
            ) : (
              <NavLink to="/login" className="topbar-auth">SIGN IN</NavLink>
            )}
            <span className={`mode-indicator ${offline ? 'mode-offline' : ''}`}>
              <i />{offline ? 'LOCAL DEMO MODE' : 'API CONNECTED'}
            </span>
            <span className="topbar-date">{today}</span>
          </div>
        </div>
        {offline && (
          <div className="offline-banner">
            Backend unavailable — showing illustrative sample data and storing new entries in this browser only.
          </div>
        )}
        {apiError && (
          <div className="api-error-banner">
            <span>{apiError.message}</span>
            <button type="button" onClick={() => { clearLastError(); setApiError(null); }}>DISMISS ✕</button>
          </div>
        )}
        {notice && (
          <div className="api-error-banner">
            <span>{notice}</span>
            <button type="button" onClick={dismissNotice}>DISMISS ✕</button>
          </div>
        )}
        <main className="content">{children}</main>
        <footer className="app-footer">
          <span>SLUDGE SMART © 2026</span>
          <span>ENGINEERING ESTIMATES · VERIFY BEFORE REGULATORY USE</span>
          <span>DATA: SAMPLE / USER-ENTERED</span>
        </footer>
      </div>
    </div>
  );
}
