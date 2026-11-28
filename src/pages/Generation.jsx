import { useMemo, useState } from 'react';
import { BarComparisonChart, TrendChart } from '../components/Charts.jsx';
import { Badge, Button, DataState, DataTable, DateRangeFilter, Field, Metric, PageHeader, Panel, SectionTitle } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCollection } from '../hooks/useData.js';
import { generationMetrics, int, num, shortDate, withinDateRange } from '../lib/calc.js';
import {
  blankGenerationForm,
  generationFormFromRecord,
  generationFormMetrics,
  latestGenerationRecord,
  updateGenerationField,
  validateGenerationForm,
} from '../lib/generation.js';
import { can } from '../lib/permissions.js';

export default function Generation() {
  const { user } = useAuth();
  const collection = useCollection('generation');
  const canWrite = can(user, 'generation:write');
  const canDelete = can(user, 'generation:delete');
  const [form, setForm] = useState(() => blankGenerationForm());
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const setField = (key) => (event) => {
    const value = event.target.value;
    setForm((current) => updateGenerationField(current, key, value));
    setMessage('');
  };

  const reset = () => {
    setForm(blankGenerationForm());
    setErrors({});
    setEditing(null);
    setMessage('');
  };

  const preview = useMemo(() => generationFormMetrics(form), [form]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const found = validateGenerationForm(form);
    setErrors(found);
    if (Object.keys(found).length) {
      setMessage('Correct the highlighted fields before saving.');
      return;
    }
    const payload = {
      date: form.date,
      wastewater_m3: Number(form.wastewater_m3),
      wet_sludge_kg: Number(form.wet_sludge_kg),
      moisture_pct: Number(form.moisture_pct),
      operating_days: Number(form.operating_days),
    };
    try {
      if (editing !== null) {
        await collection.update(editing, payload);
        setMessage(`Record ${editing} updated in the database.`);
      } else {
        await collection.add(payload);
        setMessage('Record saved to the database.');
      }
      reset();
    } catch (error) {
      setMessage(`Could not save: ${error.message}`);
    }
  };

  const startEdit = (row) => {
    setEditing(row.id);
    setForm(generationFormFromRecord(row));
    setErrors({});
    setMessage(`Editing record ${row.id}. Save to apply changes.`);
  };

  const confirmRemove = async (row) => {
    if (!window.confirm(`Delete generation record ${row.id}? This cannot be undone.`)) return;
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
    () => [...filtered].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((row) => {
      const m = generationMetrics(row);
      return { date: row.date, wet: m.wet, dry: m.dry, monthly: m.monthly, rate: m.rate };
    }),
    [filtered],
  );
  const latestRecord = useMemo(() => latestGenerationRecord(sorted), [sorted]);
  const latest = latestRecord ? generationMetrics(latestRecord) : null;

  return (
    <div className="page">
      <PageHeader
        number="02"
        kicker="MODULE / GENERATION"
        title={<>SLUDGE<br />GENERATION</>}
        subtitle="Log daily ETP operating data. Dry solids and generation rate are calculated automatically."
        meta={[
          { label: 'FORMULA 01', value: 'DS = WET × (100 − MC) / 100' },
          { label: 'FORMULA 02', value: 'RATE = DS / m³ TREATED' },
          { label: 'RECORDS', value: String(sorted.length).padStart(3, '0') },
        ]}
      />

      <div className="grid-generation">
        <Panel label="INPUT / 01" title={editing !== null ? `EDIT RECORD ${editing}` : 'DAILY OPERATING DATA'} className="form-panel">
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-grid">
              <Field label="DATE" error={errors.date}>
                <input className="input" type="date" value={form.date} onChange={setField('date')} />
              </Field>
              <Field label="WASTEWATER TREATED" unit="m³/day" error={errors.wastewater_m3}>
                <input className="input" type="number" min="0" step="any" placeholder="e.g. 420" value={form.wastewater_m3} onChange={setField('wastewater_m3')} />
              </Field>
              <Field label="WET SLUDGE GENERATED" unit="kg/day" error={errors.wet_sludge_kg}>
                <input className="input" type="number" min="0" step="any" placeholder="e.g. 1120" value={form.wet_sludge_kg} onChange={setField('wet_sludge_kg')} />
              </Field>
              <Field label="MOISTURE CONTENT" unit="%" error={errors.moisture_pct}>
                <input className="input" type="number" min="0" max="99.9" step="any" placeholder="e.g. 94.2" value={form.moisture_pct} onChange={setField('moisture_pct')} />
              </Field>
              <Field label="OPERATING DAYS" unit="days / month" error={errors.operating_days} hint="Used for monthly and annual projections.">
                <input className="input" type="number" min="1" max="31" step="any" value={form.operating_days} onChange={setField('operating_days')} />
              </Field>
            </div>
            <div className="form-actions">
              {canWrite && <Button type="submit">{editing !== null ? 'UPDATE RECORD →' : 'SAVE GENERATION RECORD →'}</Button>}
              {canWrite && <Button type="button" variant="ghost" onClick={reset}>{editing !== null ? 'CANCEL EDIT' : 'RESET'}</Button>}
              {!canWrite && <span className="form-message message-error">READ ONLY — ASK AN ADMINISTRATOR OR OPERATOR TO SAVE.</span>}
            </div>
            {message && <p className={`form-message ${message.startsWith('Correct') || message.startsWith('Could') ? 'message-error' : ''}`}>{message}</p>}
          </form>
        </Panel>

        <Panel label="OUTPUT / 02" title="AUTOMATIC CALCULATION" className="result-panel">
          {preview ? (
            <>
              <div className="calc-line">
                <span>DRY SOLIDS</span>
                <strong>{num(preview.dry)} <em>kg/day</em></strong>
              </div>
              <div className="calc-line">
                <span>GENERATION RATE</span>
                <strong>{num(preview.rate, 3)} <em>kgDS/m³</em></strong>
              </div>
              <div className="calc-line">
                <span>MONTHLY WET SLUDGE</span>
                <strong>{int(preview.monthly)} <em>kg</em></strong>
              </div>
              <div className="calc-line">
                <span>ANNUAL WET SLUDGE</span>
                <strong>{int(preview.annual)} <em>kg</em></strong>
              </div>
              <p className="panel-footnote">Live preview — enter valid values to calculate. Saving stores the record.</p>
            </>
          ) : (
            <p className="empty-state">Enter valid values in the form to see calculated results.</p>
          )}
        </Panel>
      </div>

      <SectionTitle number="01" title="PRODUCTION SUMMARY" note={`Based on the latest saved record${latestRecord ? ` · ${shortDate(latestRecord.date)}` : ''}.`} />
      <div className="metric-grid metric-grid-5">
        <Metric label="DAILY WET SLUDGE" value={latest ? int(latest.wet) : '—'} unit="kg/day" accent />
        <Metric label="DAILY DRY SLUDGE" value={latest ? num(latest.dry) : '—'} unit="kg/day" />
        <Metric label="MONTHLY PRODUCTION" value={latest ? int(latest.monthly) : '—'} unit="kg / month" />
        <Metric label="ANNUAL PRODUCTION" value={latest ? int(latest.annual) : '—'} unit="kg / year" />
        <Metric label="PER m³ WASTEWATER" value={latest ? num(latest.rate, 3) : '—'} unit="kgDS/m³" accent />
      </div>

      <SectionTitle
        number="02"
        title="HISTORICAL DATA"
        note="Filter by date, search, sort, edit or delete records. Every entry shows its source."
        action={<DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />}
      />
      <div className="grid-2">
        <Panel label="TABLE / 01" title="GENERATION LOG" action={<Badge>SOURCE LABELLED</Badge>}>
          <DataState loading={collection.loading} error={collection.error} empty={!sorted.length}>
            <DataTable
              rows={sorted.map((row) => ({ ...row, ...generationMetrics(row) }))}
              columns={[
                { key: 'date', label: 'DATE', render: (row) => shortDate(row.date) },
                { key: 'wastewater_m3', label: 'm³', align: 'right', render: (row) => int(row.wastewater_m3) },
                { key: 'wet', label: 'WET KG', align: 'right', render: (row) => int(row.wet) },
                { key: 'dry', label: 'DRY KG', align: 'right', render: (row) => num(row.dry) },
                { key: 'rate', label: 'KGDS/m³', align: 'right', render: (row) => num(row.rate, 3) },
                { key: 'source', label: 'SOURCE', render: (row) => <Badge type={row.source === 'sample' ? 'sample' : 'user'}>{row.source === 'sample' ? 'SAMPLE' : 'USER'}</Badge> },
                { key: 'actions', label: '', render: (row) => (
                  <div className="row-actions">
                    {canWrite && <button className="row-edit" type="button" onClick={() => startEdit(row)} aria-label={`Edit record ${row.id}`}>EDIT</button>}
                    {canDelete && <button className="row-delete" type="button" onClick={() => confirmRemove(row)} aria-label={`Delete record ${row.id}`}>×</button>}
                  </div>
                ) },
              ]}
              searchFields={['date', 'source']}
              initialSort={{ key: 'date', dir: 'desc' }}
            />
          </DataState>
        </Panel>
        <Panel label="FIG. 01" title="WET VS DRY SLUDGE">
          <TrendChart
            data={trend}
            series={[
              { key: 'wet', name: 'Wet sludge', color: '#E30613' },
              { key: 'dry', name: 'Dry solids', color: '#111111' },
            ]}
            unit="kg/day"
          />
          <div className="chart-legend">
            <span><i style={{ background: '#E30613' }} />WET</span>
            <span><i style={{ background: '#111111' }} />DRY</span>
          </div>
        </Panel>
      </div>

      <div className="grid-2">
        <Panel label="FIG. 02" title="GENERATION RATE TREND">
          <TrendChart data={trend} series={[{ key: 'rate', name: 'kgDS/m³', color: '#E30613' }]} unit="kgDS/m³" />
        </Panel>
        <Panel label="FIG. 03" title="PROJECTED MONTHLY WET SLUDGE">
          <BarComparisonChart
            data={trend.map((row) => ({ name: shortDate(row.date), value: Math.round(row.monthly) }))}
            xKey="name"
            bars={[{ key: 'value', name: 'KG / MONTH', color: '#111111', size: 10 }]}
            height={250}
            unit="kg"
          />
        </Panel>
      </div>
    </div>
  );
}
