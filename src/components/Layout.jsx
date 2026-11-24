import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { isOffline } from '../lib/api.js';

export const NAV_ITEMS = [
  { number: '01', label: 'Dashboard', path: '/' },
  { number: '02', label: 'Sludge Generation', path: '/generation' },
  { number: '03', label: 'Characterisation', path: '/characterisation' },
  { number: '04', label: 'Sludge Handling', path: '/handling' },
  { number: '05', label: 'Technology Selection', path: '/technology' },
  { number: '06', label: 'Compliance', path: '/compliance' },
  { number: '07', label: 'Reports', path: '/reports' },
];

function Sidebar({ open, onNavigate }) {
  const location = useLocation();
  const current = NAV_ITEMS.find((item) => item.path === location.pathname) || NAV_ITEMS[0];

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
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            onClick={onNavigate}
            className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : ''}`}
          >
            <span className="nav-number">{item.number}</span>
            <span className="nav-label">{item.label}</span>
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [offline, setOffline] = useState(isOffline());
  const location = useLocation();

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    const timer = setInterval(() => setOffline(isOffline()), 1500);
    return () => clearInterval(timer);
  }, []);

  const today = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).toUpperCase();

  return (
    <div className="app-shell">
      <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
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
