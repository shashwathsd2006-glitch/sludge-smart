import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Callout, DataTable, Field, PageHeader, Panel, SectionTitle } from '../components/UI.jsx';
import { CRITERIA } from '../data/technologies.js';
import { exportReportCsv, exportReportPdf, reportData } from '../lib/api.js';
import {
  generationMetrics, handlingMetrics, int, matrixResults, num, shortDate,
} from '../lib/calc.js';

const REPORT_NOTE_KEY = 'sludge-smart:v1:report-note';
const REPORT_TYPES = [
  { key: 'full', label: 'Full report' },
  { key: 'generation', label: 'Generation' },
  { key: 'characterisation', label: 'Characterisation' },
  { key: 'handling', label: 'Handling' },
  { key: 'technology', label: 'Technology selection' },
  { key: 'compliance', label: 'Compliance' },
  { key: 'disposal', label: 'Disposal consignments' },
];

function selectedForReportType(reportType) {
  const selected = Object.fromEntries(SECTIONS.map((section) => [section.key, reportType === 'full']));
  if (reportType === 'generation') selected.generation = true;
  if (reportType === 'characterisation') selected.characterisation = true;
  if (reportType === 'handling') { selected.handling = true; selected.reduction = true; }
  if (reportType === 'technology') { selected.technology = true; selected.cost = true; }
  if (reportType === 'compliance') selected.compliance = true;
  if (reportType === 'disposal') selected.disposal = true;
  return selected;
}

export default function Reports() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reportType, setReportType] = useState('full');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState(selectedForReportType('full'));
  const [status, setStatus] = useState('');
  const [reportNote, setReportNote] = useState(() => {
    try {
      return localStorage.getItem(REPORT_NOTE_KEY) || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    try { localStorage.setItem(REPORT_NOTE_KEY, reportNote); } catch { return; }
  }, [reportNote]);

  const refresh = async (next = {}) => {
    const params = {
      date_from: next.date_from ?? dateFrom,
      date_to: next.date_to ?? dateTo,
      report_type: next.report_type ?? reportType,
    };
    setLoading(true);
    try {
      setData(await reportData(params));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const derived = useMemo(() => {
    if (!data) return null;
    const generation = [...data.generation].sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .map((row) => ({ ...row, ...generationMetrics(row) }));
    const handling = [...data.handling].sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .map((row) => ({ ...row, ...handlingMetrics(row) }));
    const disposal = [...(data.disposal || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const technology = matrixResults(data.technology);
    const winner = technology[0];
    const actionCount = data.compliance.filter((row) => row.status === 'Action required').length;
    const missingCount = data.compliance.filter((row) => row.status === 'Information missing').length;
    const avgMoisture = generation.length
      ? generation.reduce((sum, row) => sum + row.moisture_pct, 0) / generation.length : 0;
    const recommendations = [
      ['Technology', winner ? `${winner.name} ranks first (${num(winner.score, 2)}/5) with the current weights. Validate with a site trial and confirm vendor capabilities before procurement.` : 'No technology data available.'],
      ['Process focus', `Measured average sludge moisture is ${num(avgMoisture)}%. Confirm dewatering performance against actual solids recovery, not mass balance alone.`],
      ['Compliance', `${actionCount} checkpoint(s) need action and ${missingCount} need information. Obtain current CPCB/KSPCB consent conditions and laboratory reports before concluding compliance.`],
      ['Data quality', 'Replace illustrative sample records with site measurements and laboratory reports. Record source labels for every entry.'],
      ['Disposal', 'Reconcile generated, stored and dispatched quantities against signed manifests and authorised facility records.'],
    ];
    return { generation, handling, disposal, technology, recommendations };
  }, [data]);

  const toggle = (key) => setSelected((current) => ({ ...current, [key]: !current[key] }));
  const changeReportType = (nextType) => {
    setReportType(nextType);
    setSelected(selectedForReportType(nextType));
    refresh({ report_type: nextType });
  };
  const applyFilters = () => refresh({ date_from: dateFrom, date_to: dateTo, report_type: reportType });
  const exportParams = { date_from: dateFrom || undefined, date_to: dateTo || undefined, report_type: reportType };

  if (loading || !data || !derived) {
    return (
      <div className="page">
        <PageHeader number="07" kicker="MODULE / EXPORT" title={<>REPORTS &amp;<br />EXPORTS</>} subtitle="Preparing report data…" />
        <p className="data-status data-status-error">{error || 'Loading records from the data store…'}</p>
        {error && !loading && <Button variant="secondary" onClick={refresh}>RETRY</Button>}
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        number="07"
        kicker="MODULE / EXPORT"
        title={<>REPORTS &amp;<br />EXPORTS</>}
        subtitle="Compile analysis, calculations, comparisons and recommendations into a downloadable report."
        meta={[
          { label: 'GENERATED', value: new Date(data.generated_at).toLocaleDateString('en-IN').toUpperCase() },
          { label: 'SECTIONS', value: String(Object.values(selected).filter(Boolean).length).padStart(2, '0') },
          { label: 'FORMATS', value: 'PDF / CSV' },
        ]}
      />

      <Callout title="REPORT SCOPE">
        Sample data remains labelled in exports. Reports are engineering decision aids and do not constitute legal compliance certification.
      </Callout>
      {error && <p className="data-status data-status-error">{error}</p>}

      <SectionTitle number="01" title="REPORT FILTERS & EXPORT" note="All exported sections use the selected reporting period and report type." />
      <div className="grid-2 grid-equal">
        <Panel label="CONFIG / 01" title="REPORT CONTENT">
          <div className="form-grid">
            <Field label="REPORT TYPE">
              <select className="input" value={reportType} onChange={(e) => changeReportType(e.target.value)}>
                {REPORT_TYPES.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
              </select>
            </Field>
            <Field label="START DATE"><input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></Field>
            <Field label="END DATE"><input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></Field>
          </div>
          <div className="form-actions">
            <Button variant="secondary" onClick={applyFilters}>APPLY FILTERS</Button>
            <Button variant="ghost" onClick={() => { setDateFrom(''); setDateTo(''); refresh({ date_from: '', date_to: '' }); }}>CLEAR PERIOD</Button>
          </div>
          <div className="check-grid">
            {SECTIONS.map((section) => (
              <label className="check-item" key={section.key}>
                <input type="checkbox" checked={selected[section.key]} onChange={() => toggle(section.key)} />
                <span className="check-number">{section.number}</span>
                <span>{section.label}</span>
              </label>
            ))}
          </div>
          <div className="form-actions">
            <Button onClick={async () => {
              setStatus('Generating PDF…');
              try { await exportReportPdf(exportParams); setStatus('PDF downloaded.'); }
              catch (err) { setStatus(`PDF failed: ${err.message}`); }
            }}>DOWNLOAD PDF ↓</Button>
            <Button variant="secondary" onClick={async () => {
              setStatus('Generating CSV…');
              try { await exportReportCsv(exportParams); setStatus('CSV downloaded.'); }
              catch (err) { setStatus(`CSV failed: ${err.message}`); }
            }}>DOWNLOAD CSV ↓</Button>
            <Button variant="ghost" onClick={() => refresh()}>REFRESH DATA</Button>
          </div>
          {status && <p className="form-message">{status}</p>}
        </Panel>

        <Panel label="PREVIEW / 01" title="REPORT SUMMARY">
          <div className="report-summary">
            <div><span>GENERATION RECORDS</span><strong className="red">{String(derived.generation.length).padStart(2, '0')}</strong></div>
            <div><span>LAB RECORDS</span><strong>{String(data.characterisation.length).padStart(2, '0')}</strong></div>
            <div><span>HANDLING RUNS</span><strong>{String(derived.handling.length).padStart(2, '0')}</strong></div>
            <div><span>CONSIGNMENTS</span><strong>{String(derived.disposal.length).padStart(2, '0')}</strong></div>
            <div><span>TECHNOLOGIES</span><strong>{String(derived.technology.length).padStart(2, '0')}</strong></div>
          </div>
          <p className="panel-footnote">PDF is generated in the browser with monochrome Swiss-style tables and a row-limit notice. CSV contains every selected record.</p>
        </Panel>
      </div>

      <SectionTitle number="02" title="REPORT PREVIEW" note="On-screen preview of selected content. Print layout is optimised for A4." />

      {selected.generation && (
        <Panel label="01 / ANALYSIS" title="SLUDGE GENERATION ANALYSIS" action={<Badge>{derived.generation.length} RECORDS</Badge>}>
          <DataTable
            rows={derived.generation}
            columns={[
              { key: 'date', label: 'DATE', render: (row) => shortDate(row.date) },
              { key: 'wastewater_m3', label: 'm³/DAY', align: 'right', render: (row) => int(row.wastewater_m3) },
              { key: 'wet', label: 'WET KG', align: 'right', render: (row) => int(row.wet) },
              { key: 'dry', label: 'DRY KG', align: 'right', render: (row) => num(row.dry) },
              { key: 'rate', label: 'KGDS/m³', align: 'right', render: (row) => num(row.rate, 3) },
              { key: 'source', label: 'SOURCE', render: (row) => <Badge type={row.source === 'sample' ? 'sample' : 'user'}>{row.source === 'sample' ? 'SAMPLE' : 'USER'}</Badge> },
            ]}
            searchFields={['date', 'source']}
          />
        </Panel>
      )}

      {selected.characterisation && (
        <Panel label="02 / ANALYSIS" title="CHARACTERISATION RESULTS">
          <DataTable
            rows={data.characterisation}
            columns={[
              { key: 'date', label: 'DATE', render: (row) => shortDate(row.date) },
              { key: 'sample_id', label: 'SAMPLE' },
              { key: 'ph', label: 'pH', align: 'right', render: (row) => num(row.ph, 1) },
              { key: 'moisture_pct', label: 'MOIST %', align: 'right', render: (row) => num(row.moisture_pct) },
              { key: 'total_solids_pct', label: 'TS %', align: 'right', render: (row) => num(row.total_solids_pct) },
              { key: 'lead_mgkg', label: 'Pb', align: 'right', render: (row) => num(row.lead_mgkg, 1) },
              { key: 'chromium_mgkg', label: 'Cr', align: 'right', render: (row) => num(row.chromium_mgkg, 1) },
              { key: 'cadmium_mgkg', label: 'Cd', align: 'right', render: (row) => num(row.cadmium_mgkg, 1) },
              { key: 'nickel_mgkg', label: 'Ni', align: 'right', render: (row) => num(row.nickel_mgkg, 1) },
            ]}
            searchFields={['sample_id', 'date']}
          />
        </Panel>
      )}

      {(selected.handling || selected.reduction) && (
        <Panel label={selected.reduction ? '03 / 05' : '03 / ANALYSIS'} title={selected.reduction ? 'HANDLING PERFORMANCE & VOLUME REDUCTION' : 'HANDLING PERFORMANCE'}>
          <DataTable
            rows={derived.handling}
            columns={[
              { key: 'date', label: 'DATE', render: (row) => shortDate(row.date) },
              { key: 'technology', label: 'TECHNOLOGY' },
              { key: 'initial_mass_kg', label: 'INITIAL KG', align: 'right', render: (row) => int(row.initial_mass_kg) },
              { key: 'finalMass', label: 'FINAL KG', align: 'right', render: (row) => num(row.finalMass) },
              { key: 'dryRetained', label: 'DS RETAINED', align: 'right', render: (row) => num(row.dryRetained) },
              { key: 'reduction', label: 'REDUCTION', align: 'right', render: (row) => `${num(row.reduction)} %` },
            ]}
            searchFields={['technology', 'date']}
          />
        </Panel>
      )}

      {selected.disposal && (
        <Panel label="04 / ANALYSIS" title="TRANSPORT & DISPOSAL CONSIGNMENTS" action={<Badge>{derived.disposal.length} RECORDS</Badge>}>
          <DataTable
            rows={derived.disposal}
            columns={[
              { key: 'date', label: 'DATE', render: (row) => shortDate(row.date) },
              { key: 'quantity_kg', label: 'QUANTITY', align: 'right', render: (row) => `${int(row.quantity_kg)} kg` },
              { key: 'facility', label: 'FACILITY' },
              { key: 'manifest_no', label: 'MANIFEST' },
              { key: 'transport_mode', label: 'MODE' },
              { key: 'source', label: 'SOURCE', render: (row) => <Badge type={row.source === 'sample' ? 'sample' : 'user'}>{row.source === 'sample' ? 'SAMPLE' : 'USER'}</Badge> },
            ]}
            searchFields={['facility', 'manifest_no', 'date']}
          />
        </Panel>
      )}

      {(selected.technology || selected.cost) && (
        <Panel label={selected.cost ? '06 / 07' : '06 / ANALYSIS'} title={selected.cost ? 'TECHNOLOGY COMPARISON & COST ANALYSIS' : 'TECHNOLOGY COMPARISON'}>
          <DataTable
            rows={derived.technology}
            columns={[
              { key: 'name', label: 'TECHNOLOGY' },
              { key: 'group', label: 'STAGE' },
              { key: 'score', label: 'SCORE / 5', align: 'right', render: (row) => num(row.score, 2) },
              { key: 'capexLakh', label: 'CAPEX ₹L', align: 'right', render: (row) => int(row.capexLakh) },
              { key: 'opexLakhYear', label: 'OPEX ₹L/YR', align: 'right', render: (row) => num(row.opexLakhYear) },
              { key: 'energyKwhTon', label: 'KWH/T', align: 'right', render: (row) => int(row.energyKwhTon) },
            ]}
            searchFields={['name', 'group']}
          />
        </Panel>
      )}

      {selected.compliance && (
        <Panel label="08 / ANALYSIS" title="COMPLIANCE CHECKLIST">
          <DataTable
            rows={data.compliance}
            columns={[
              { key: 'area', label: 'AREA' },
              { key: 'requirement', label: 'REQUIREMENT' },
              { key: 'status', label: 'STATUS' },
              { key: 'due_date', label: 'DUE', render: (row) => shortDate(row.due_date) },
            ]}
            searchFields={['area', 'requirement', 'status', 'note']}
          />
        </Panel>
      )}

      {selected.recommendations && (
        <Panel label="09 / CONCLUSION" title="FINAL RECOMMENDATIONS">
          <div className="recommendation-list">
            {derived.recommendations.map(([topic, text]) => (
              <div className="recommendation-row" key={topic}>
                <span>{topic.toUpperCase()}</span>
                <p>{text}</p>
              </div>
            ))}
          </div>
          <Field label="REPORT NOTE" hint="Saved in this browser. Recommendations are generated from the current dataset and must be reviewed by qualified personnel.">
            <textarea
              className="input textarea"
              rows={3}
              value={reportNote}
              onChange={(event) => setReportNote(event.target.value)}
              placeholder="Add internal review comments here (not included in exported files)."
            />
          </Field>
        </Panel>
      )}
    </div>
  );
}
