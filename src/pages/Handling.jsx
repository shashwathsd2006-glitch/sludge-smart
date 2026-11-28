import { useEffect, useMemo, useState } from 'react';
import { BarComparisonChart } from '../components/Charts.jsx';
import { Badge, Button, Callout, DataState, DataTable, DateRangeFilter, Field, PageHeader, Panel, SectionTitle } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { HANDLING_OPTIONS } from '../data/technologies.js';
import { useCollection } from '../hooks/useData.js';
import { handlingMetrics, int, num, shortDate, withinDateRange } from '../lib/calc.js';
import { orderHandlingRuns } from '../lib/handling.js';
import { can } from '../lib/permissions.js';

const today = () => new Date().toISOString().slice(0, 10);

const GROUP_NOTES = {
  Thickening: 'Removes a portion of water before downstream treatment. Volume reduction is modest; solids are assumed fully retained.',
  Dewatering: 'Produces a handleable cake. Final moisture strongly influences transport and disposal cost.',
  Drying: 'Further reduces moisture using solar, thermal or recovered waste heat. Space and energy needs differ significantly.',
};

const GROUP_INDEX = { Thickening: '01', Dewatering: '02', Drying: '03' };

function blank(group) {
  return {
    date: today(),
    technology: HANDLING_OPTIONS[group][0],
    initial_mass_kg: '',
    initial_moisture_pct: '',
    final_moisture_pct: '',
  };
}

function validate(form) {
  const errors = {};
  if (!form.date) errors.date = 'Date is required.';
  const mass = Number(form.initial_mass_kg);
  const initial = Number(form.initial_moisture_pct);
  const final = Number(form.final_moisture_pct);
  if (!form.initial_mass_kg || !Number.isFinite(mass) || mass <= 0) errors.initial_mass_kg = 'Enter mass greater than 0.';
  if (form.initial_moisture_pct === '' || !Number.isFinite(initial) || initial < 0 || initial >= 100) errors.initial_moisture_pct = 'Use 0 to below 100.';
  if (form.final_moisture_pct === '' || !Number.isFinite(final) || final < 0 || final >= 100) errors.final_moisture_pct = 'Use 0 to below 100.';
  if (!errors.initial_moisture_pct && !errors.final_moisture_pct && final > initial) errors.final_moisture_pct = 'Final moisture cannot exceed initial.';
  return errors;
}

function HandlingForm({ group, collection, canWrite, editTarget, onEditDone }) {
  const [form, setForm] = useState(() => blank(group));
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(null);

  const setField = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setMessage('');
  };

  const reset = () => {
    setForm(blank(group));
    setErrors({});
    setEditing(null);
    setMessage('');
    onEditDone();
  };

  useEffect(() => {
    if (editTarget && editTarget.row.process_group === group) {
      setEditing(editTarget.id);
      setForm({
        date: editTarget.row.date,
        technology: editTarget.row.technology,
        initial_mass_kg: String(editTarget.row.initial_mass_kg),
        initial_moisture_pct: String(editTarget.row.initial_moisture_pct),
        final_moisture_pct: String(editTarget.row.final_moisture_pct),
      });
      setErrors({});
      setMessage(`Editing run ${editTarget.id}. Save to apply changes.`);
      return;
    }
    if (editing !== null) {
      setForm(blank(group));
      setErrors({});
      setEditing(null);
      setMessage('');
    }
  }, [editTarget, group, editing]);

  const preview = useMemo(() => {
    if (Object.keys(validate(form)).length) return null;
    return handlingMetrics({
      initial_mass_kg: Number(form.initial_mass_kg),
      initial_moisture_pct: Number(form.initial_moisture_pct),
      final_moisture_pct: Number(form.final_moisture_pct),
    });
  }, [form]);

  const submit = async (event) => {
    event.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) { setMessage('Correct the highlighted fields.'); return; }
    const payload = {
      date: form.date,
      process_group: group,
      technology: form.technology,
      initial_mass_kg: Number(form.initial_mass_kg),
      initial_moisture_pct: Number(form.initial_moisture_pct),
      final_moisture_pct: Number(form.final_moisture_pct),
    };
    try {
      if (editing !== null) {
        await collection.update(editing, payload);
        setMessage(`Run ${editing} updated.`);
      } else {
        await collection.add(payload);
        setMessage(`${group} run saved.`);
      }
      reset();
    } catch (error) {
      setMessage(`Could not save: ${error.message}`);
    }
  };

  const options = [...new Set([...HANDLING_OPTIONS[group], form.technology])].filter(Boolean);

  return (
    <Panel label={`INPUT / ${GROUP_INDEX[group]}`} title={editing !== null ? `EDIT RUN ${editing}` : `${group.toUpperCase()} CALCULATOR`} className="form-panel">
      <p className="panel-intro">{GROUP_NOTES[group]}</p>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field label="DATE" error={errors.date}>
            <input className="input" type="date" value={form.date} onChange={setField('date')} />
          </Field>
          <Field label="TECHNOLOGY">
            <select className="input" value={form.technology} onChange={setField('technology')}>
              {options.map((option) => <option key={option}>{option}</option>)}
            </select>
          </Field>
          <Field label="INITIAL SLUDGE MASS" unit="kg" error={errors.initial_mass_kg}>
            <input className="input" type="number" step="any" min="0" placeholder="e.g. 1000" value={form.initial_mass_kg} onChange={setField('initial_mass_kg')} />
          </Field>
          <Field label="INITIAL MOISTURE" unit="%" error={errors.initial_moisture_pct}>
            <input className="input" type="number" step="any" min="0" max="99.9" placeholder="e.g. 94" value={form.initial_moisture_pct} onChange={setField('initial_moisture_pct')} />
          </Field>
          <Field label="FINAL MOISTURE" unit="%" error={errors.final_moisture_pct}>
            <input className="input" type="number" step="any" min="0" max="99.9" placeholder="e.g. 70" value={form.final_moisture_pct} onChange={setField('final_moisture_pct')} />
          </Field>
        </div>
        <div className="calc-strip">
          <div><span>DRY SOLIDS RETAINED</span><strong>{preview ? `${num(preview.dryRetained)} kg` : '—'}</strong></div>
          <div><span>FINAL SLUDGE MASS</span><strong>{preview ? `${num(preview.finalMass)} kg` : '—'}</strong></div>
          <div><span>MASS REDUCTION</span><strong className="red">{preview ? `${num(preview.reduction)} %` : '—'}</strong></div>
        </div>
        <div className="form-actions">
          {canWrite && <Button type="submit">{editing !== null ? 'UPDATE RUN →' : 'SAVE HANDLING RUN →'}</Button>}
          {canWrite && <Button type="button" variant="ghost" onClick={reset}>{editing !== null ? 'CANCEL EDIT' : 'RESET'}</Button>}
          {!canWrite && <span className="form-message message-error">READ ONLY — OPERATOR ROLE REQUIRED TO SAVE.</span>}
        </div>
        {message && <p className={`form-message ${message.startsWith('Correct') || message.startsWith('Could') ? 'message-error' : ''}`}>{message}</p>}
      </form>
    </Panel>
  );
}

export default function Handling() {
  const { user } = useAuth();
  const collection = useCollection('handling');
  const canWrite = can(user, 'handling:write');
  const canDelete = can(user, 'handling:delete');
  const [editTarget, setEditTarget] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filteredRuns = useMemo(
    () => collection.data.filter((run) => withinDateRange(run, dateFrom, dateTo)),
    [collection.data, dateFrom, dateTo],
  );
  const runs = useMemo(
    () => orderHandlingRuns(filteredRuns).map((run) => ({ ...run, ...handlingMetrics(run) })),
    [filteredRuns],
  );

  const comparison = useMemo(() => {
    const seen = new Map();
    [...filteredRuns]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.id ?? 0) - Number(a.id ?? 0))
      .forEach((run) => {
        if (!seen.has(run.technology)) seen.set(run.technology, { ...run, ...handlingMetrics(run) });
      });
    return [...seen.values()].sort((a, b) => b.reduction - a.reduction);
  }, [filteredRuns]);

  const confirmRemove = async (row) => {
    if (!window.confirm(`Delete handling run ${row.id}? This cannot be undone.`)) return;
    try {
      await collection.remove(row.id);
      if (editTarget?.id === row.id) setEditTarget(null);
    } catch (error) {
      window.alert(`Could not delete run ${row.id}: ${error.message}`);
    }
  };

  return (
    <div className="page">
      <PageHeader
        number="04"
        kicker="MODULE / PROCESS"
        title={<>SLUDGE<br />HANDLING</>}
        subtitle="Model thickening, dewatering and drying performance using mass-balance calculations."
        meta={[
          { label: 'STAGES', value: '03' },
          { label: 'TECHNOLOGIES', value: String(Object.values(HANDLING_OPTIONS).flat().length).padStart(2, '0') },
          { label: 'LOGGED RUNS', value: String(runs.length).padStart(3, '0') },
        ]}
      />

      <Callout title="CALCULATION BASIS">
        Dry solids are assumed fully retained — only water is removed. Final mass = (initial mass × initial dry fraction) / final dry fraction.
        Solids losses in filtrate or decanter liquor are not modelled. Results are engineering estimates.
      </Callout>

      {Object.keys(HANDLING_OPTIONS).map((group) => (
        <section className="module-section" key={group}>
          <SectionTitle
            number={GROUP_INDEX[group]}
            title={group.toUpperCase()}
            note={`${HANDLING_OPTIONS[group].length} processes · ${GROUP_NOTES[group]}`}
          />
          <div className="grid-2 grid-equal">
            <HandlingForm
              group={group}
              collection={collection}
              canWrite={canWrite}
              editTarget={editTarget}
              onEditDone={() => setEditTarget(null)}
            />
            <Panel label="OPTIONS / 01" title={`${group.toUpperCase()} PROCESS LIST`}>
              <div className="option-list">
                {HANDLING_OPTIONS[group].map((option, index) => (
                  <div className="option-row" key={option}>
                    <span className="option-index">{String(index + 1).padStart(2, '0')}</span>
                    <div><strong>{option}</strong><span>{GROUP_NOTES[group]}</span></div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </section>
      ))}

      <SectionTitle
        number="04"
        title="HANDLING PERFORMANCE"
        note="Comparison is based on the most recent logged run per technology. Filter by date, then search, edit or delete runs."
        action={<DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />}
      />
      <div className="grid-2">
        <Panel label="TABLE / 01" title="RUN COMPARISON" action={<Badge>MASS BALANCE</Badge>}>
          <DataState loading={collection.loading} error={collection.error} empty={!runs.length}>
            <DataTable
              rows={runs}
              columns={[
                { key: 'date', label: 'DATE', render: (row) => shortDate(row.date) },
                { key: 'technology', label: 'TECHNOLOGY' },
                { key: 'initial_mass_kg', label: 'INITIAL KG', align: 'right', render: (row) => int(row.initial_mass_kg) },
                { key: 'initial_moisture_pct', label: 'INIT %', align: 'right', render: (row) => num(row.initial_moisture_pct) },
                { key: 'final_moisture_pct', label: 'FINAL %', align: 'right', render: (row) => num(row.final_moisture_pct) },
                { key: 'dryRetained', label: 'DS RETAINED', align: 'right', render: (row) => num(row.dryRetained) },
                { key: 'finalMass', label: 'FINAL KG', align: 'right', render: (row) => num(row.finalMass) },
                { key: 'reduction', label: 'REDUCTION', align: 'right', render: (row) => <strong className="red">{num(row.reduction)} %</strong> },
                { key: 'source', label: 'SOURCE', render: (row) => <Badge type={row.source === 'sample' ? 'sample' : 'user'}>{row.source === 'sample' ? 'SAMPLE' : 'USER'}</Badge> },
                { key: 'actions', label: '', render: (row) => (
                  <div className="row-actions">
                    {canWrite && <button className="row-edit" type="button" onClick={() => setEditTarget({ id: row.id, row })} aria-label={`Edit run ${row.id}`}>EDIT</button>}
                    {canDelete && <button className="row-delete" type="button" onClick={() => confirmRemove(row)} aria-label={`Delete run ${row.id}`}>×</button>}
                  </div>
                ) },
              ]}
              searchFields={['technology', 'date', 'process_group']}
              initialSort={null}
            />
          </DataState>
        </Panel>
        <Panel label="FIG. 01" title="MASS REDUCTION BY TECHNOLOGY">
          <BarComparisonChart
            data={comparison.map((run) => ({ name: run.technology, reduction: Number(run.reduction.toFixed(1)) }))}
            xKey="name"
            bars={[{ key: 'reduction', name: 'MASS REDUCTION (%)', color: '#E30613', size: 14 }]}
            height={340}
            unit="%"
          />
        </Panel>
      </div>
    </div>
  );
}
