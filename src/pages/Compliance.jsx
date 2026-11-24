import { useState } from 'react';
import { Badge, Button, Callout, DataTable, Field, Metric, PageHeader, Panel, SectionTitle, StatusPill } from '../components/UI.jsx';
import { useCollection } from '../hooks/useData.js';
import { int, shortDate } from '../lib/calc.js';

const STATUSES = ['Compliant', 'Action required', 'Information missing'];
const blank = () => ({ area: '', requirement: '', detail: '', due_date: '' });
const blankDisposal = () => ({ date: new Date().toISOString().slice(0, 10), quantity_kg: '', facility: '', manifest_no: '', transport_mode: 'Covered truck' });

export default function Compliance() {
  const checklist = useCollection('compliance');
  const disposal = useCollection('disposal');
  const [filter, setFilter] = useState('All');
  const [form, setForm] = useState(blank());
  const [disposalForm, setDisposalForm] = useState(blankDisposal());
  const [message, setMessage] = useState('');
  const [disposalMessage, setDisposalMessage] = useState('');

  const rows = checklist.data.filter((row) => filter === 'All' || row.status === filter);
  const counts = {
    Compliant: checklist.data.filter((row) => row.status === 'Compliant').length,
    'Action required': checklist.data.filter((row) => row.status === 'Action required').length,
    'Information missing': checklist.data.filter((row) => row.status === 'Information missing').length,
  };
  const disposedQty = checklist.data.length ? disposal.data.reduce((sum, row) => sum + Number(row.quantity_kg || 0), 0) : 0;

  const addItem = async (event) => {
    event.preventDefault();
    if (!form.area.trim() || !form.requirement.trim()) { setMessage('Area and requirement are mandatory.'); return; }
    try {
      await checklist.add({
        area: form.area.trim(), requirement: form.requirement.trim(),
        detail: form.detail.trim(), due_date: form.due_date || null,
        status: 'Information missing', note: '',
      });
      setForm(blank());
      setMessage('Checkpoint added with status “Information missing”.');
    } catch (error) { setMessage(`Could not add: ${error.message}`); }
  };

  const addDisposal = async (event) => {
    event.preventDefault();
    const quantity = Number(disposalForm.quantity_kg);
    if (!disposalForm.date || !Number.isFinite(quantity) || quantity <= 0 || !disposalForm.facility.trim() || !disposalForm.manifest_no.trim()) {
      setDisposalMessage('Date, quantity, facility and manifest number are required.');
      return;
    }
    try {
      await disposal.add({
        date: disposalForm.date, quantity_kg: quantity,
        facility: disposalForm.facility.trim(), manifest_no: disposalForm.manifest_no.trim(),
        transport_mode: disposalForm.transport_mode.trim(),
      });
      setDisposalForm(blankDisposal());
      setDisposalMessage('Disposal consignment recorded.');
    } catch (error) { setDisposalMessage(`Could not add: ${error.message}`); }
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

      <div className="metric-grid metric-grid-4">
        <Metric label="TOTAL CHECKPOINTS" value={checklist.data.length} unit="items" accent />
        <Metric label="COMPLIANT" value={counts.Compliant} unit="items" note="User verified" />
        <Metric label="ACTION REQUIRED" value={counts['Action required']} unit="items" accent />
        <Metric label="INFORMATION MISSING" value={counts['Information missing']} unit="items" />
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
        <DataTable
          rows={rows}
          columns={[
            { key: 'id', label: 'NO', align: 'right', render: (row) => String(row.id).padStart(2, '0') },
            { key: 'area', label: 'AREA' },
            { key: 'requirement', label: 'REQUIREMENT' },
            { key: 'detail', label: 'CURRENT EVIDENCE' },
            {
              key: 'status', label: 'STATUS',
              render: (row) => (
                <select
                  className={`status-select status-select-${row.status === 'Compliant' ? 'ok' : row.status === 'Action required' ? 'action' : 'missing'}`}
                  value={row.status}
                  onChange={(event) => checklist.update(row.id, { status: event.target.value })}
                  aria-label={`Status for ${row.area}`}
                >
                  {STATUSES.map((status) => <option key={status}>{status}</option>)}
                </select>
              ),
            },
            { key: 'due_date', label: 'DUE', render: (row) => shortDate(row.due_date) },
            {
              key: 'note', label: 'NOTE',
              render: (row) => (
                <input
                  className="inline-input"
                  defaultValue={row.note || ''}
                  key={`${row.id}-${row.note}`}
                  onBlur={(event) => {
                    if (event.target.value !== (row.note || '')) checklist.update(row.id, { note: event.target.value });
                  }}
                  aria-label={`Note for ${row.area}`}
                  placeholder="—"
                />
              ),
            },
            { key: 'updated_at', label: 'UPDATED', render: (row) => row.updated_at ? String(row.updated_at).slice(0, 10) : '—' },
            { key: 'actions', label: '', render: (row) => <button className="row-delete" type="button" onClick={() => checklist.remove(row.id)} aria-label={`Delete checkpoint ${row.id}`}>×</button> },
          ]}
          searchFields={['area', 'requirement', 'detail', 'note', 'status']}
          initialSort={{ key: 'id', dir: 'asc' }}
        />
      </Panel>

      <SectionTitle number="02" title="ADD CHECKPOINT" note="New items start as “Information missing” until evidence is reviewed." />
      <Panel label="INPUT / 01" title="NEW REQUIREMENT">
        <form onSubmit={addItem} noValidate>
          <div className="form-grid form-grid-4">
            <Field label="AREA"><input className="input" placeholder="e.g. Sludge storage" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} /></Field>
            <Field label="REQUIREMENT"><input className="input" placeholder="Requirement to track" value={form.requirement} onChange={(e) => setForm({ ...form, requirement: e.target.value })} /></Field>
            <Field label="EVIDENCE / DETAIL"><input className="input" placeholder="Current status of evidence" value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} /></Field>
            <Field label="DUE DATE"><input className="input" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
          </div>
          <div className="form-actions">
            <Button type="submit">ADD CHECKPOINT →</Button>
            {message && <span className={`form-message inline ${message.startsWith('Could') || message.startsWith('Area') ? 'message-error' : ''}`}>{message}</span>}
          </div>
        </form>
      </Panel>

      <SectionTitle number="03" title="TRANSPORT & DISPOSAL RECORDS" note="Consignment evidence for off-site movement and authorised disposal." />
      <div className="grid-2 grid-equal">
        <Panel label="INPUT / 02" title="NEW DISPOSAL CONSIGNMENT">
          <form onSubmit={addDisposal} noValidate>
            <div className="form-grid">
              <Field label="DATE"><input className="input" type="date" value={disposalForm.date} onChange={(e) => setDisposalForm({ ...disposalForm, date: e.target.value })} /></Field>
              <Field label="QUANTITY" unit="kg"><input className="input" type="number" step="any" min="0" placeholder="e.g. 1920" value={disposalForm.quantity_kg} onChange={(e) => setDisposalForm({ ...disposalForm, quantity_kg: e.target.value })} /></Field>
              <Field label="AUTHORISED FACILITY"><input className="input" placeholder="Facility name" value={disposalForm.facility} onChange={(e) => setDisposalForm({ ...disposalForm, facility: e.target.value })} /></Field>
              <Field label="MANIFEST NUMBER"><input className="input" placeholder="e.g. MFT-26-11-018" value={disposalForm.manifest_no} onChange={(e) => setDisposalForm({ ...disposalForm, manifest_no: e.target.value })} /></Field>
              <Field label="TRANSPORT MODE"><input className="input" placeholder="e.g. Covered truck" value={disposalForm.transport_mode} onChange={(e) => setDisposalForm({ ...disposalForm, transport_mode: e.target.value })} /></Field>
            </div>
            <div className="form-actions">
              <Button type="submit">SAVE CONSIGNMENT →</Button>
              {disposalMessage && <span className={`form-message inline ${disposalMessage.startsWith('Could') || disposalMessage.startsWith('Date') ? 'message-error' : ''}`}>{disposalMessage}</span>}
            </div>
          </form>
        </Panel>
        <Panel label="TABLE / 02" title="CONSIGNMENT REGISTER">
          <DataTable
            rows={disposal.data}
            columns={[
              { key: 'date', label: 'DATE', render: (row) => shortDate(row.date) },
              { key: 'quantity_kg', label: 'QUANTITY', align: 'right', render: (row) => `${int(row.quantity_kg)} kg` },
              { key: 'facility', label: 'FACILITY' },
              { key: 'manifest_no', label: 'MANIFEST' },
              { key: 'source', label: 'SOURCE', render: (row) => <Badge type={row.source === 'sample' ? 'sample' : 'user'}>{row.source === 'sample' ? 'SAMPLE' : 'USER'}</Badge> },
              { key: 'actions', label: '', render: (row) => <button className="row-delete" type="button" onClick={() => disposal.remove(row.id)} aria-label={`Delete consignment ${row.id}`}>×</button> },
            ]}
            searchFields={['facility', 'manifest_no', 'date']}
          />
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
