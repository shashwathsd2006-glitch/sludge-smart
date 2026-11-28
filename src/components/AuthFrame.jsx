import { PageHeader } from './UI.jsx';

export default function AuthFrame({
  number,
  kicker,
  title,
  subtitle,
  meta = [],
  children,
  footnote,
  action,
}) {
  return (
    <div className="auth-screen">
      <header className="auth-header">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">SLUDGE<br /><strong>SMART</strong></span>
        </div>
        <div className="auth-header-meta">
          <span>INDUSTRIAL ETP</span>
          <span>SECURE ACCESS / {number}</span>
        </div>
      </header>
      <main className="auth-main">
        <div className="auth-grid">
          <PageHeader
            number={number}
            kicker={kicker}
            title={title}
            subtitle={subtitle}
            meta={meta}
          />
          <div className="auth-form-column">
            {children}
            {action && <div className="auth-action">{action}</div>}
          </div>
        </div>
        {footnote && <div className="auth-footnote">{footnote}</div>}
      </main>
      <footer className="auth-footer">
        <span>SLUDGE SMART © 2026</span>
        <span>SESSION DATA HELD IN THIS BROWSER TAB ONLY</span>
      </footer>
    </div>
  );
}
