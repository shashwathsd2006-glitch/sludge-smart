import { useEffect, useState } from 'react';
import { Badge, Button, Callout, DataState, DataTable, DateRangeFilter, Field, Metric, PageHeader, Panel, SectionTitle, StatusPill } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCollection } from '../hooks/useData.js';
import { getComplianceReconciliation } from '../lib/api.js';
import { int, shortDate, withinDateRange } from '../lib/calc.js';
import { can } from '../lib/permissions.js';

const STATUSES = ['Compliant', 'Action required', 'Information missing'];
const blank = () => ({ area: '', requirement: '', detail: '', due_date: '' });
const blankDisposal = () => ({ date: new Date().toISOString().slice(0, 10), quantity_kg: '', authorised_facility: '', manifest_number: '', transport_mode: 'Covered truck' });

export default function Compliance() {
  const { user } = useAuth();
  const checklist = useCollection('compliance');
  const disposal = useCollection('consignments');
  const generation = useCollection('generation');
  const canWriteCompliance = can(user, 'compliance:write');
  const canDeleteCompliance = can(user, 'compliance:delete');
  const canWriteDisposal = can(user, 'disposal:write');
  const canDeleteDisposal = can(user, 'disposal:delete');
  const [filter, setFilter] = useState('All');
  const [form, setForm] = useState(blank());
  const [disposalForm, setDisposalForm] = useState(blankDisposal());
  const [message, setMessage] = useState('');
  const [disposalMessage, setDisposalMessage] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [editingDisposal, setEditingDisposal] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [openingStock, setOpeningStock] = useState('');
  const [recon, setRecon] = useState(null);
  const [reconError, setReconError] = useState('');

  const rows = checklist.data.filter((row) => filter === 'All' || row.status === filter);
  const disposalRecords = Array.isArray(disposal.data) ? disposal.data : [];
  const disposalRows = disposalRecords.filter((row) => withinDateRange(row, dateFrom, dateTo));
  const counts = {
    Compliant: checklist.data.filter((row) => row.status === 'Compliant').length,
    'Action required': checklist.data.filter((row) => row.status === 'Action required').length,
    'Information missing': checklist.data.filter((row) => row.status === 'Information missing').length,
  };
  const disposedQty = disposalRows.reduce((sum, row) => sum + Number(row.quantity_kg || 0), 0);
  const overdueCount = checklist.data.filter((row) => row.due_date && row.status !== 'Compliant' && row.due_date < new Date().toISOString().slice(0,10)).length;

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await getComplianceReconciliation({ date_from: dateFrom, date_to: dateTo, opening_stock_kg: openingStock });
        if (active) { setRecon(data); setReconError(''); }
      } catch (error) {
        if (active) setReconError(error.message || 'Could not calculate reconciliation.');
      }
    };
    load();
    return () => { active = false; };
  }, [dateFrom, dateTo, openingStock, generation.data, disposal.data]);

  const resetItem = () => {
    setForm(blank());
    setEditingItem(null);
  };

  const resetDisposal = () => {
    setDisposalForm(blankDisposal());
    setEditingDisposal(null);
  };

  const updateChecklist = async (id, values) => {
    try {
      await checklist.update(id, values);
      setMessage(`Checkpoint ${id} updated.`);
    } catch (error) {
      setMessage(`Could not update: ${error.message}`);
    }
  };

  const startItemEdit = (row) => {
    setEditingItem(row.id);
    setForm({ area: row.area, requirement: row.requirement, detail: row.detail || '', due_date: row.due_date || '' });
    setMessage(`Editing checkpoint ${row.id}. Save to apply changes.`);
  };

  const startDisposalEdit = (row) => {
    setEditingDisposal(row.id);
    setDisposalForm({
      date: row.date,
      quantity_kg: String(row.quantity_kg),
      authorised_facility: row.authorised_facility || row.facility || '',
      manifest_number: row.manifest_number || row.manifest_no || '',
      transport_mode: row.transport_mode || '',
    });
    setDisposalMessage(`Editing consignment ${row.id}. Save to apply changes.`);
  };

  const addItem = async (event) => {
    event.preventDefault();
    if (!form.area.trim() || !form.requirement.trim()) { setMessage('Area and requirement are mandatory.'); return; }
    const values = {
      area: form.area.trim(),
      requirement: form.requirement.trim(),
      detail: form.detail.trim(),
      due_date: form.due_date || null,
    };
    try {
      if (editingItem !== null) {
        await checklist.update(editingItem, values);
        setMessage(`Checkpoint ${editingItem} updated.`);
      } else {
        await checklist.add({ ...values, status: 'Information missing', note: '' });
        setMessage('Checkpoint added with status “Information missing”.');
      }
      resetItem();
    } catch (error) { setMessage(`Could not save: ${error.message}`); }
  };

  const addDisposal = async (event) => {
    event.preventDefault();
    const quantity = Number(disposalForm.quantity_kg);
    if (!disposalForm.date || !Number.isFinite(quantity) || quantity <= 0 || !disposalForm.authorised_facility.trim() || !disposalForm.manifest_number.trim()) {
      setDisposalMessage('Date, quantity, authorised facility and manifest number are required.');
      return;
    }
    const payload = {
      date: disposalForm.date,
      quantity_kg: quantity,
      authorised_facility: disposalForm.authorised_facility.trim(),
      manifest_number: disposalForm.manifest_number.trim(),
      transport_mode: disposalForm.transport_mode.trim(),
    };
    try {
      if (editingDisposal !== null) {
        await disposal.update(editingDisposal, payload);
        setDisposalMessage(`Consignment ${editingDisposal} updated.`);
      } else {
        await disposal.add(payload);
        setDisposalMessage('Disposal consignment recorded.');
      }
      resetDisposal();
    } catch (error) { setDisposalMessage(`Could not save: ${error.message}`); }
  };

  const confirmChecklistDelete = async (row) => {
    if (!window.confirm(`Delete checkpoint ${row.id}? This cannot be undone.`)) return;
    try {
      await checklist.remove(row.id);
      if (editingItem === row.id) resetItem();
    } catch (error) {
      setMessage(`Could not delete: ${error.message}`);
    }
  };

  const confirmDisposalDelete = async (row) => {
    if (!window.confirm(`Delete consignment ${row.id}? This cannot be undone.`)) return;
    try {
      await disposal.remove(row.id);
      if (editingDisposal === row.id) resetDisposal();
    } catch (error) {
      setDisposalMessage(`Could not delete: ${error.message}`);
    }
  };

  return (
    <div className="page">
      <PageHeader
        number="06"
        kicker="MODULE / REGULATORY"
        title={<>COMPLIANCE<br />MONITORING</>}
        subtitle="Maintain evidence for classification, testing, authorisation, storage, transport and disposal."
        meta={[
          { label: 'CHECKPOINTS', value: String(checklist.data.length).padStart(2, '0') },
          { label: 'CONSIGNMENTS', value: String(disposal.data.length).padStart(2, '0') },
          { label: 'DISPOSED TOTAL', value: `${int(disposedQty)} KG` },
        ]}
      />

      <Callout title="NO AUTOMATIC LEGAL CERTIFICATION">
        This interface tracks internal readiness only. It does not certify legal compliance. Statuses are user-maintained
        and must be verified against current CPCB/KSPCB consent conditions, authorisations and laboratory reports.
      </Callout>

      <div className="metric-grid metric-grid-5">
        <Metric label="TOTAL CHECKPOINTS" value={checklist.data.length} unit="items" accent />
        <Metric label="COMPLIANT" value={counts.Compliant} unit="items" note="User verified" />
        <Metric label="ACTION REQUIRED" value={counts['Action required']} unit="items" accent />
        <Metric label="INFORMATION MISSING" value={counts['Information missing']} unit="items" />
        <Metric label="OVERDUE" value={overdueCount} unit="items" note="Due date passed" />
      </div>

      <SectionTitle number="01" title="COMPLIANCE CHECKLIST" note="Change a status inline. Notes and due dates are saved immediately." />
      <Panel
        label="TABLE / 01"
        title="REQUIREMENT REGISTER"
        action={
          <div className="filter-group">
            {['All', ...STATUSES].map((status) => (
              <button
                key={status}
                type="button"
                className={`filter-button ${filter === status ? 'filter-active' : ''}`}
                onClick={() => setFilter(status)}
              >
                {status.toUpperCase()} <span>{status === 'All' ? checklist.data.length : counts[status]}</span>
              </button>
            ))}
          </div>
        }
      >
        <DataState loading={checklist.loading} error={checklist.error} empty={!rows.length}>
          <DataTable
            rows={rows}
            columns={[
              { key: 'id', label: 'NO', align: 'right', render: (row) => String(row.id).padStart(2, '0') },
              { key: 'area', label: 'AREA' },
              { key: 'requirement', label: 'REQUIREMENT' },
              { key: 'detail', label: 'CURRENT EVIDENCE' },
              {
                key: 'status', label: 'STATUS',
                render: (row) => (canWriteCompliance ? (
                  <select
                    className={`status-select status-select-${row.status === 'Compliant' ? 'ok' : row.status === 'Action required' ? 'action' : 'missing'}`}
                    value={row.status}
                    onChange={(event) => updateChecklist(row.id, { status: event.target.value })}
                    aria-label={`Status for ${row.area}`}
                  >
                    {STATUSES.map((status) => <option key={status}>{status}</option>)}
                  </select>
                ) : <StatusPill status={row.status} />),
              },
              { key: 'due_date', label: 'DUE', render: (row) => shortDate(row.due_date) },
              {
                key: 'note', label: 'NOTE',
                render: (row) => (canWriteCompliance ? (
                  <input
                    className="inline-input"
                    defaultValue={row.note || ''}
                    key={`${row.id}-${row.note}`}
                    onBlur={(event) => {
                      if (event.target.value !== (row.note || '')) updateChecklist(row.id, { note: event.target.value });
                    }}
                    aria-label={`Note for ${row.area}`}
                    placeholder="—"
                  />
                ) : (row.note || '—')),
              },
              { key: 'updated_at', label: 'UPDATED', render: (row) => row.updated_at ? String(row.updated_at).slice(0, 10) : '—' },
              { key: 'actions', label: '', render: (row) => (
                <div className="row-actions">
                  {canWriteCompliance && <button className="row-edit" type="button" onClick={() => startItemEdit(row)} aria-label={`Edit checkpoint ${row.id}`}>EDIT</button>}
                  {canDeleteCompliance && <button className="row-delete" type="button" onClick={() => confirmChecklistDelete(row)} aria-label={`Delete checkpoint ${row.id}`}>×</button>}
                </div>
              ) },
            ]}
            searchFields={['area', 'requirement', 'detail', 'note', 'status']}
            initialSort={{ key: 'id', dir: 'asc' }}
          />
        </DataState>
      </Panel>

      <SectionTitle number="02" title={editingItem !== null ? `EDIT CHECKPOINT ${editingItem}` : 'ADD CHECKPOINT'} note="New items start as “Information missing” until evidence is reviewed." />
      <Panel label="INPUT / 01" title={editingItem !== null ? 'UPDATE REQUIREMENT' : 'NEW REQUIREMENT'}>
        <form onSubmit={addItem} noValidate>
          <div className="form-grid form-grid-4">
            <Field label="AREA"><input className="input" placeholder="e.g. Sludge storage" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} /></Field>
            <Field label="REQUIREMENT"><input className="input" placeholder="Requirement to track" value={form.requirement} onChange={(e) => setForm({ ...form, requirement: e.target.value })} /></Field>
            <Field label="EVIDENCE / DETAIL"><input className="input" placeholder="Current status of evidence" value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} /></Field>
            <Field label="DUE DATE"><input className="input" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
          </div>
          <div className="form-actions">
            {canWriteCompliance && <Button type="submit">{editingItem !== null ? 'UPDATE CHECKPOINT →' : 'ADD CHECKPOINT →'}</Button>}
            {canWriteCompliance && <Button type="button" variant="ghost" onClick={resetItem}>{editingItem !== null ? 'CANCEL EDIT' : 'RESET'}</Button>}
            {!canWriteCompliance && <span className="form-message inline message-error">READ ONLY — COMPLIANCE WRITE REQUIRED.</span>}
            {message && <span className={`form-message inline ${message.startsWith('Could') || message.startsWith('Area') ? 'message-error' : ''}`}>{message}</span>}
          </div>
        </form>
      </Panel>

      <SectionTitle number="03" title="QUANTITY RECONCILIATION" note="Calculated from generation and disposal records in the selected period. Not a legal compliance determination." />
      <Panel label="CALC / 01" title="SLUDGE QUANTITY RECONCILIATION">
        <div className="form-grid form-grid-4">
          <Field label="OPENING STOCK" unit="kg"><input className="input" type="number" step="any" min="0" placeholder="Enter opening stock" value={openingStock} onChange={(e) => setOpeningStock(e.target.value)} /></Field>
          <Field label="PERIOD FROM"><input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></Field>
          <Field label="PERIOD TO"><input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></Field>
          <Field label="FORMULA"><div className="input" style={{display:'flex',alignItems:'center'}}>Closing = Opening + Generated − Disposed</div></Field>
        </div>
        {reconError && <p className="data-status data-status-error">{reconError}</p>}
        {recon && (
          <>
            <div className="metric-grid metric-grid-4" style={{marginTop:16}}>
              <Metric label="OPENING STOCK" value={recon.opening_stock_kg === null ? '—' : int(recon.opening_stock_kg)} unit="kg" note="User-entered" />
              <Metric label="GENERATED" value={int(recon.sludge_generated_kg)} unit="kg" note="Calculated" />
              <Metric label="DISPOSED" value={int(recon.sludge_disposed_kg)} unit="kg" note="Calculated" />
              <Metric label="CLOSING STOCK" value={recon.closing_stock_kg === null ? '—' : int(recon.closing_stock_kg)} unit="kg" accent={recon.negative_closing_stock} note={recon.negative_closing_stock ? 'Negative - investigate' : 'Calculated'} />
            </div>
            {recon.missing_data?.length > 0 && <div className="callout" style={{marginTop:16}}><strong>DATA REQUIRED</strong><p>{recon.missing_data.join(' ')}</p></div>}
            {recon.negative_closing_stock && <p className="data-status data-status-error">Unexplained negative closing stock. Verify opening stock, generation records, and disposal consignments.</p>}
            <p className="panel-footnote">Records used: {recon.generation_record_count} generation, {recon.disposal_record_count} disposal. {recon.disclaimer}</p>
          </>
        )}
      </Panel>

      <SectionTitle
        number="04"
        title="TRANSPORT & DISPOSAL RECORDS"
        note="Consignment evidence for off-site movement and authorised disposal. Filter by date, then search, edit or delete records."
        action={<DateRangeFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />}
      />
      <p className="panel-footnote">Showing {disposalRows.length} of {disposalRecords.length} consignment records.</p>
      <div className="grid-2 grid-equal">
        <Panel label="INPUT / 02" title={editingDisposal !== null ? `EDIT CONSIGNMENT ${editingDisposal}` : 'NEW DISPOSAL CONSIGNMENT'}>
          <form onSubmit={addDisposal} noValidate>
            <div className="form-grid">
              <Field label="DATE"><input className="input" type="date" value={disposalForm.date} onChange={(e) => setDisposalForm({ ...disposalForm, date: e.target.value })} /></Field>
              <Field label="QUANTITY" unit="kg"><input className="input" type="number" step="any" min="0" placeholder="e.g. 1920" value={disposalForm.quantity_kg} onChange={(e) => setDisposalForm({ ...disposalForm, quantity_kg: e.target.value })} /></Field>
              <Field label="AUTHORISED FACILITY"><input className="input" placeholder="Facility name" value={disposalForm.authorised_facility} onChange={(e) => setDisposalForm({ ...disposalForm, authorised_facility: e.target.value })} /></Field>
              <Field label="MANIFEST NUMBER"><input className="input" placeholder="e.g. MFT-26-11-018" value={disposalForm.manifest_number} onChange={(e) => setDisposalForm({ ...disposalForm, manifest_number: e.target.value })} /></Field>
              <Field label="TRANSPORT MODE"><input className="input" placeholder="e.g. Covered truck" value={disposalForm.transport_mode} onChange={(e) => setDisposalForm({ ...disposalForm, transport_mode: e.target.value })} /></Field>
            </div>
            <div className="form-actions">
              {canWriteDisposal && <Button type="submit">{editingDisposal !== null ? 'UPDATE CONSIGNMENT →' : 'SAVE CONSIGNMENT →'}</Button>}
              {canWriteDisposal && <Button type="button" variant="ghost" onClick={resetDisposal}>{editingDisposal !== null ? 'CANCEL EDIT' : 'RESET'}</Button>}
              {!canWriteDisposal && <span className="form-message inline message-error">READ ONLY — DISPOSAL WRITE REQUIRED.</span>}
              {disposalMessage && <span className={`form-message inline ${disposalMessage.startsWith('Could') || disposalMessage.startsWith('Date') ? 'message-error' : ''}`}>{disposalMessage}</span>}
            </div>
          </form>
        </Panel>
        <Panel label="TABLE / 02" title="CONSIGNMENT REGISTER">
          <DataState loading={disposal.loading} error={disposal.error} empty={!disposal.loading && !disposal.error && disposalRecords.length === 0}>
            {disposalRows.length === 0 && disposalRecords.length > 0 ? (
              <p className="empty-state">No consignment records match the current filters.</p>
            ) : (
              <DataTable
                rows={disposalRows}
                columns={[
                  { key: 'date', label: 'DATE', render: (row) => shortDate(row.date) },
                  { key: 'quantity_kg', label: 'QUANTITY', align: 'right', render: (row) => `${int(row.quantity_kg)} kg` },
                  { key: 'authorised_facility', label: 'FACILITY', render: (row) => row.authorised_facility || row.facility || '—' },
                  { key: 'manifest_number', label: 'MANIFEST', render: (row) => row.manifest_number || row.manifest_no || '—' },
                  { key: 'transport_mode', label: 'TRANSPORT', render: (row) => row.transport_mode || '—' },
                  { key: 'source', label: 'SOURCE', render: (row) => <Badge type={row.source === 'sample' ? 'sample' : 'user'}>{row.source === 'sample' ? 'SAMPLE' : 'USER'}</Badge> },
                  { key: 'actions', label: '', render: (row) => (
                    <div className="row-actions">
                      {canWriteDisposal && <button className="row-edit" type="button" onClick={() => startDisposalEdit(row)} aria-label={`Edit consignment ${row.id}`}>EDIT</button>}
                      {canDeleteDisposal && <button className="row-delete" type="button" onClick={() => confirmDisposalDelete(row)} aria-label={`Delete consignment ${row.id}`}>×</button>}
                    </div>
                  ) },
                ]}
                searchFields={['authorised_facility', 'facility', 'manifest_number', 'manifest_no', 'date', 'transport_mode']}
                empty="No consignment records match the current filters."
              />
            )}
          </DataState>
        </Panel>
      </div>

      <div className="status-legend">
        <div><StatusPill status="Compliant" /><span>Evidence reviewed and recorded by the user.</span></div>
        <div><StatusPill status="Action required" /><span>A follow-up task is outstanding.</span></div>
        <div><StatusPill status="Information missing" /><span>Evidence or applicability not yet available.</span></div>
      </div>
    </div>
  );
}
