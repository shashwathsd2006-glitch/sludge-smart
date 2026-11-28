import { useMemo, useState } from 'react';
import { TrendChart } from '../components/Charts.jsx';
import { Badge, Button, Callout, DataState, DataTable, DateRangeFilter, Field, PageHeader, Panel, SectionTitle, StatusPill } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCollection } from '../hooks/useData.js';
import {
  missingParameters, num, PARAMETERS, SCREENING_BANDS, screeningFlags, shortDate, withinDateRange,
} from '../lib/calc.js';
import { can } from '../lib/permissions.js';

const blank = () => ({
  date: new Date().toISOString().slice(0, 10),
  sample_id: '',
  ph: '', moisture_pct: '', total_solids_pct: '', volatile_solids_pct: '',
  oil_grease_mgkg: '', cod_mgl: '', lead_mgkg: '', chromium_mgkg: '',
  cadmium_mgkg: '', nickel_mgkg: '', other_contaminants: '',
});

function validate(form) {
  const errors = {};
  if (!form.date) errors.date = 'Date is required.';
  if (!form.sample_id.trim()) errors.sample_id = 'Sample ID is required.';
  PARAMETERS.forEach(({ key, label }) => {
    const raw = form[key];
    if (raw === '') return;
    const value = Number(raw);
    const band = SCREENING_BANDS[key];
    if (!Number.isFinite(value) || value < 0) errors[key] = 'Enter a non-negative number.';
    else if (key === 'ph' && value > 14) errors[key] = 'pH must be 0–14.';
    else if (key !== 'ph' && band.max <= 100 && value > 100) errors[key] = `${label} cannot exceed 100%.`;
  });
  return errors;
}

function payloadFrom(form) {
  const payload = {};
  PARAMETERS.forEach(({ key }) => { payload[key] = form[key] === '' ? null : Number(form[key]); });
  return {
    date: form.date,
    sample_id: form.sample_id.trim(),
    other_contaminants: form.other_contaminants.trim(),
    ...payload,
  };
}

export default function Characterisation() {
  const { user } = useAuth();
  const collection = useCollection('lab');
  const canWrite = can(user, 'lab:write');
  const canDelete = can(user, 'lab:delete');
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [trendKey, setTrendKey] = useState('ph');
  const [editing, setEditing] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const setField = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setMessage('');
  };

  const reset = () => {
    setForm(blank());
    setErrors({});
    setEditing(null);
    setMessage('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) {
      setMessage('Correct the highlighted fields before saving.');
      return;
    }
    try {
      if (editing !== null) {
        await collection.update(editing, payloadFrom(form));
        setMessage(`Laboratory record ${editing} updated.`);
      } else {
        await collection.add(payloadFrom(form));
        setMessage('Laboratory record saved.');
      }
      reset();
    } catch (error) {
      setMessage(`Could not save: ${error.message}`);
    }
  };

  const startEdit = (row) => {
    setEditing(row.id);
    setForm({
      date: row.date,
      sample_id: row.sample_id,
      other_contaminants: row.other_contaminants || '',
      ...Object.fromEntries(PARAMETERS.map(({ key }) => [key, row[key] ?? ''])),
    });
    setErrors({});
    setMessage(`Editing record ${row.id}. Save to apply changes.`);
  };

  const confirmRemove = async (row) => {
    if (!window.confirm(`Delete laboratory record ${row.id}? This cannot be undone.`)) return;
    try {
      await collection.remove(row.id);
      setMessage(`Record ${row.id} deleted.`);
      if (editing === row.id) reset();
    } catch (error) {
      setMessage(`Could not delete: ${error.message}`);
    }
  };

  const filtered = useMemo(
    () => collection.data.filter((row) => withinDateRange(row, dateFrom, dateTo)),
    [collection.data, dateFrom, dateTo],
  );
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [filtered],
  );
  const trend = useMemo(
    () => [...filtered].sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((row) => ({ date: row.date, value: row[trendKey] })),
    [filtered, trendKey],
  );

  const flagged = useMemo(() => sorted.filter((row) => screeningFlags(row).length > 0), [sorted]);
  const missing = useMemo(() => sorted.map((row) => ({ ...row, missing: missingParameters(row) })).filter((row) => row.missing.length), [sorted]);
  const selected = PARAMETERS.find((item) => item.key === trendKey);

  return (
    <div className="page">
      <PageHeader
        number="03"
        kicker="MODULE / LABORATORY"
        title={<>SLUDGE<br />CHARACTERISATION</>}
        subtitle="Record laboratory analyses, review trends and identify parameters that need attention."
        meta={[
          { label: 'PARAMETERS TRACKED', value: String(PARAMETERS.length).padStart(2, '0') },
          { label: 'TEST RECORDS', value: String(sorted.length).padStart(3, '0') },
          { label: 'UNUSUAL RESULTS', value: String(flagged.length).padStart(2, '0') },
        ]}
      />

      <Callout title="IMPORTANT — VALUES AND LIMITS">
        Screening flags shown here are illustrative internal data-quality checks, not actual test results and not regulatory limits.
        Only a recognised laboratory report and the applicable CPCB/KSPCB conditions can establish compliance.
      </Callout>

      <SectionTitle number="01" title="LABORATORY DATA ENTRY" note="Leave a field blank when a parameter was not tested — blanks are reported as missing." />
      <Panel label="INPUT / 01" title={editing !== null ? `EDIT RECORD ${editing}` : 'NEW TEST RECORD'} className="form-panel">
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-grid form-grid-3">
            <Field label="SAMPLE ID" error={errors.sample_id}>
              <input className="input" placeholder="e.g. LAB-2611-04" value={form.sample_id} onChange={setField('sample_id')} />
            </Field>
            <Field label="TEST DATE" error={errors.date}>
              <input className="input" type="date" value={form.date} onChange={setField('date')} />
            </Field>
            {PARAMETERS.map(({ key, label, unit }) => (
              <Field key={key} label={label.toUpperCase()} unit={unit || undefined} error={errors[key]}>
                <input className="input" type="number" step="any" min="0" placeholder="—" value={form[key]} onChange={setField(key)} />
              </Field>
            ))}
            <Field label="OTHER CONTAMINANTS / NOTES" className="field-wide" hint="Free text. Does not affect screening flags.">
              <input className="input" placeholder="e.g. Sulphide: 12 mg/kg" value={form.other_contaminants} onChange={setField('other_contaminants')} />
            </Field>
          </div>
          <div className="form-actions">
            {canWrite && <Button type="submit">{editing !== null ? 'UPDATE RECORD →' : 'SAVE LABORATORY RECORD →'}</Button>}
            {canWrite && <Button type="button" variant="ghost" onClick={reset}>{editing !== null ? 'CANCEL EDIT' : 'RESET'}</Button>}
            {!canWrite && <span className="form-message message-error">READ ONLY — LABORATORY ROLE REQUIRED TO SAVE.</span>}
          </div>
          {message && <p className={`form-message ${message.startsWith('Correct') || message.startsWith('Could') ? 'message-error' : ''}`}>{message}</p>}
        </form>
      </Panel>

      <SectionTitle
        number="02"
        title="HISTORICAL RESULTS"
        note="Filter by date, then search a test register with source labels and unusual-result flags."
        action={<DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />}
      />
      <Panel label="TABLE / 01" title="LABORATORY TEST REGISTER" action={<Badge>UNITS SHOWN IN HEADERS</Badge>}>
        <DataState loading={collection.loading} error={collection.error} empty={!sorted.length}>
          <DataTable
            rows={sorted.map((row) => ({
              ...row,
              flagList: screeningFlags(row).map((key) => PARAMETERS.find((p) => p.key === key)?.label).join(', '),
            }))}
            columns={[
              { key: 'date', label: 'DATE', render: (row) => shortDate(row.date) },
              { key: 'sample_id', label: 'SAMPLE ID' },
              { key: 'ph', label: 'pH', align: 'right', render: (row) => num(row.ph, 1) },
              { key: 'moisture_pct', label: 'MOIST %', align: 'right', render: (row) => num(row.moisture_pct) },
              { key: 'total_solids_pct', label: 'TS %', align: 'right', render: (row) => num(row.total_solids_pct) },
              { key: 'volatile_solids_pct', label: 'VS %', align: 'right', render: (row) => num(row.volatile_solids_pct) },
              { key: 'oil_grease_mgkg', label: 'O&G mg/kg', align: 'right', render: (row) => num(row.oil_grease_mgkg, 0) },
              { key: 'cod_mgl', label: 'COD mg/L', align: 'right', render: (row) => num(row.cod_mgl, 0) },
              { key: 'lead_mgkg', label: 'Pb mg/kg', align: 'right', render: (row) => num(row.lead_mgkg, 1) },
              { key: 'chromium_mgkg', label: 'Cr mg/kg', align: 'right', render: (row) => num(row.chromium_mgkg, 1) },
              { key: 'cadmium_mgkg', label: 'Cd mg/kg', align: 'right', render: (row) => row.cadmium_mgkg == null ? <span className="muted">—</span> : num(row.cadmium_mgkg, 1) },
              { key: 'nickel_mgkg', label: 'Ni mg/kg', align: 'right', render: (row) => num(row.nickel_mgkg, 1) },
              { key: 'flagList', label: 'REVIEW', render: (row) => row.flagList ? <span className="flag-cell"><StatusPill status="Unusual" />{row.flagList}</span> : <span className="muted">NORMAL</span> },
              { key: 'source', label: 'SOURCE', render: (row) => <Badge type={row.source === 'sample' ? 'sample' : 'user'}>{row.source === 'sample' ? 'SAMPLE' : 'USER'}</Badge> },
              { key: 'actions', label: '', render: (row) => (
                <div className="row-actions">
                  {canWrite && <button className="row-edit" type="button" onClick={() => startEdit(row)} aria-label={`Edit lab record ${row.id}`}>EDIT</button>}
                  {canDelete && <button className="row-delete" type="button" onClick={() => confirmRemove(row)} aria-label={`Delete lab record ${row.id}`}>×</button>}
                </div>
              ) },
            ]}
            searchFields={['sample_id', 'date', 'other_contaminants', 'flagList']}
            initialSort={{ key: 'date', dir: 'desc' }}
          />
        </DataState>
      </Panel>

      <SectionTitle number="03" title="TRENDS & DATA QUALITY" note="Select a parameter to plot its history. Unusual and missing values are listed below." />
      <div className="grid-2">
        <Panel
          label="FIG. 01"
          title="PARAMETER TREND"
          action={
            <select className="select" value={trendKey} onChange={(event) => setTrendKey(event.target.value)} aria-label="Select trend parameter">
              {PARAMETERS.map((param) => <option key={param.key} value={param.key}>{param.label.toUpperCase()}</option>)}
            </select>
          }
        >
          <TrendChart
            data={trend}
            series={[{ key: 'value', name: selected?.label || trendKey, color: '#E30613' }]}
            unit={selected?.unit || ''}
          />
          <p className="panel-footnote">{selected?.label} · {selected?.unit || 'unitless'} · chronological order</p>
        </Panel>
        <Panel label="REVIEW / 01" title="UNUSUAL RESULTS">
          {flagged.length === 0 ? (
            <p className="empty-state">No values outside the illustrative screening bands.</p>
          ) : (
            <div className="review-list">
              {flagged.slice(0, 8).map((row) => (
                <div className="review-item" key={row.id}>
                  <div><strong>{row.sample_id}</strong><span>{shortDate(row.date)}</span></div>
                  <div className="review-flags">
                    {screeningFlags(row).map((key) => {
                      const band = SCREENING_BANDS[key];
                      return <span key={key}>{PARAMETERS.find((p) => p.key === key)?.label}: {num(row[key], 1)} <em>(band {band.min}–{band.max})</em></span>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="panel-footnote">Bands are illustrative review aids, not compliance limits.</p>
        </Panel>
      </div>

      <Panel label="REVIEW / 02" title="MISSING LABORATORY PARAMETERS">
        {missing.length === 0 ? (
          <p className="empty-state">All tracked parameters are present in every record.</p>
        ) : (
          <DataTable
            rows={missing}
            columns={[
              { key: 'date', label: 'DATE', render: (row) => shortDate(row.date) },
              { key: 'sample_id', label: 'SAMPLE ID' },
              { key: 'missing', label: 'MISSING PARAMETERS', render: (row) => row.missing.map((key) => PARAMETERS.find((p) => p.key === key)?.label).join(' · ') },
            ]}
            searchFields={['sample_id', 'date', 'missing']}
          />
        )}
      </Panel>
    </div>
  );
}
