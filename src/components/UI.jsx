import { useMemo, useState } from 'react';

export function PageHeader({ number, kicker, title, subtitle, meta }) {
  return (
    <header className="page-header">
      <div className="page-header-main">
        <div className="eyebrow"><span className="red">{number}</span> / {kicker}</div>
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {meta && (
        <div className="page-header-meta">
          {meta.map((item) => (
            <div className="meta-line" key={item.label}>
              <span>{item.label}</span><strong>{item.value}</strong>
            </div>
          ))}
        </div>
      )}
    </header>
  );
}

export function SectionTitle({ number, title, note, action }) {
  return (
    <div className="section-title">
      <div className="section-title-left">
        {number && <span className="section-number">{number}</span>}
        <div>
          <h2>{title}</h2>
          {note && <p>{note}</p>}
        </div>
      </div>
      {action && <div className="section-action">{action}</div>}
    </div>
  );
}

export function Metric({ label, value, unit, note, accent = false, size = 'md' }) {
  return (
    <div className={`metric metric-${size} ${accent ? 'metric-accent' : ''}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        <span>{value}</span>{unit && <em>{unit}</em>}
      </div>
      {note && <div className="metric-note">{note}</div>}
    </div>
  );
}

const STATUS_CLASS = {
  Compliant: 'status-ok',
  'Action required': 'status-action',
  'Information missing': 'status-missing',
  Unusual: 'status-action',
  Sample: 'status-sample',
  User: 'status-ok',
};

export function StatusPill({ status }) {
  return <span className={`status-pill ${STATUS_CLASS[status] || 'status-missing'}`}>{status}</span>;
}

export function Badge({ children, type = 'sample' }) {
  return <span className={`badge badge-${type}`}>{children}</span>;
}

export function Field({ label, unit, hint, error, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">
        {label}{unit && <em>{unit}</em>}
      </span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Button({ variant = 'primary', children, ...props }) {
  return <button className={`button button-${variant}`} {...props}>{children}</button>;
}

export function Callout({ title, children, tone = 'neutral' }) {
  return (
    <div className={`callout callout-${tone}`}>
      <div className="callout-title">{title}</div>
      <div className="callout-body">{children}</div>
    </div>
  );
}

export function Panel({ title, label, children, className = '', action }) {
  return (
    <section className={`panel ${className}`}>
      {(title || label) && (
        <div className="panel-header">
          <div>
            {label && <div className="panel-label">{label}</div>}
            {title && <h3>{title}</h3>}
          </div>
          {action}
        </div>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function DataTable({ columns, rows, searchPlaceholder = 'Search records…', searchFields, empty = 'No records found.', initialSort }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(initialSort || null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = rows || [];
    if (q) {
      result = result.filter((row) =>
        (searchFields || columns.map((c) => c.key)).some((key) =>
          String(row[key] ?? '').toLowerCase().includes(q)
        )
      );
    }
    if (sort) {
      result = [...result].sort((a, b) => {
        const av = a[sort.key];
        const bv = b[sort.key];
        const cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av ?? '').localeCompare(String(bv ?? ''));
        return sort.dir === 'desc' ? -cmp : cmp;
      });
    }
    return result;
  }, [rows, query, sort, searchFields, columns]);

  const toggleSort = (key) => {
    setSort((current) => current?.key === key
      ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' });
  };

  return (
    <div className="data-table">
      <div className="table-toolbar">
        <div className="table-search">
          <span className="search-mark" aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        </div>
        <span className="table-count">{String(visible.length).padStart(2, '0')} / {String(rows.length).padStart(2, '0')} RECORDS</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={column.align === 'right' ? 'align-right' : ''}>
                  <button type="button" onClick={() => toggleSort(column.key)}>
                    {column.label}
                    <span className="sort-mark">
                      {sort?.key === column.key ? (sort.dir === 'asc' ? '↑' : '↓') : '·'}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td className="table-empty" colSpan={columns.length}>{empty}</td></tr>
            )}
            {visible.map((row, index) => (
              <tr key={row.id ?? index}>
                {columns.map((column) => (
                  <td key={column.key} className={column.align === 'right' ? 'align-right' : ''}>
                    {column.render ? column.render(row) : (row[column.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EmptyState({ label }) {
  return <div className="empty-state">{label}</div>;
}

export function KeyValue({ label, value, accent }) {
  return (
    <div className="key-value">
      <span>{label}</span>
      <strong className={accent ? 'red' : ''}>{value}</strong>
    </div>
  );
}
