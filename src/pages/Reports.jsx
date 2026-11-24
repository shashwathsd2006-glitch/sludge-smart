import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Callout, DataTable, Field, PageHeader, Panel, SectionTitle } from '../components/UI.jsx';
import { CRITERIA } from '../data/technologies.js';
import { reportData } from '../lib/api.js';
import {
  generationMetrics, handlingMetrics, int, matrixResults, num, shortDate,
} from '../lib/calc.js';

const SECTIONS = [
  { key: 'generation', number: '01', label: 'Sludge generation analysis' },
  { key: 'characterisation', number: '02', label: 'Characterisation results' },
  { key: 'handling', number: '03', label: 'Sludge handling performance' },
  { key: 'reduction', number: '04', label: 'Volume reduction calculations' },
  { key: 'technology', number: '05', label: 'Technology comparison' },
  { key: 'cost', number: '06', label: 'Cost analysis' },
  { key: 'compliance', number: '07', label: 'Compliance checklist' },
  { key: 'recommendations', number: '08', label: 'Final recommendations' },
];

const csvCell = (value) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function buildCsv(selected, data, derived) {
  const blocks = [];
  const push = (title, headers, rows) => {
    blocks.push([title], headers, ...rows, []);
  };
  blocks.push(['SLUDGE SMART — INDUSTRIAL ETP SLUDGE MANAGEMENT REPORT'],
    ['Generated', new Date().toLocaleString('en-IN')],
    ['Data note', 'Sample records are illustrative and are not laboratory results or regulatory limits.'], []);

  if (selected.generation) {
    push('01 SLUDGE GENERATION ANALYSIS',
      ['Date', 'Wastewater m3/d', 'Wet sludge kg/d', 'Moisture %', 'Dry solids kg/d', 'Rate kgDS/m3', 'Monthly kg', 'Annual kg', 'Source'],
      derived.generation.map((row) => [row.date, row.wastewater_m3, row.wet_sludge_kg, row.moisture_pct,
        row.dry.toFixed(2), row.rate.toFixed(4), row.monthly.toFixed(0), row.annual.toFixed(0), row.source]));
  }
  if (selected.characterisation) {
    push('02 CHARACTERISATION RESULTS',
      ['Date', 'Sample ID', 'pH', 'Moisture %', 'TS %', 'VS %', 'Oil & grease mg/kg', 'COD mg/L', 'Pb mg/kg', 'Cr mg/kg', 'Cd mg/kg', 'Ni mg/kg', 'Other', 'Source'],
      data.characterisation.map((row) => [row.date, row.sample_id, row.ph, row.moisture_pct, row.total_solids_pct,
        row.volatile_solids_pct, row.oil_grease_mgkg, row.cod_mgl, row.lead_mgkg, row.chromium_mgkg,
        row.cadmium_mgkg, row.nickel_mgkg, row.other_contaminants, row.source]));
  }
  if (selected.handling || selected.reduction) {
    const headers = ['Date', 'Stage', 'Technology', 'Initial kg', 'Initial moisture %', 'Final moisture %',
      'Dry solids retained kg', 'Final mass kg', 'Mass reduction %', 'Source'];
    const rows = derived.handling.map((row) => [row.date, row.process_group, row.technology, row.initial_mass_kg,
      row.initial_moisture_pct, row.final_moisture_pct, row.dryRetained.toFixed(2), row.finalMass.toFixed(2),
      row.reduction.toFixed(2), row.source]);
    if (selected.handling) push('03 SLUDGE HANDLING PERFORMANCE', headers, rows);
    if (selected.reduction) push('04 VOLUME REDUCTION CALCULATIONS', headers, rows);
  }
  if (selected.technology || selected.cost) {
    const headers = ['Rank', 'Technology', 'Stage', 'Weighted score /5', ...CRITERIA.map((c) => c.label),
      'Capex Rs lakh', 'Opex Rs lakh/yr', 'Energy kWh/t', 'Chemical kg/t', 'Space m2'];
    const rows = derived.technology.map((row, index) => [index + 1, row.name, row.group, row.score.toFixed(2),
      ...CRITERIA.map((c) => row.scores[c.key]), row.capexLakh, row.opexLakhYear, row.energyKwhTon,
      row.chemicalKgTon, row.spaceM2]);
    if (selected.technology) push('05 TECHNOLOGY COMPARISON', headers, rows);
    if (selected.cost) push('06 COST ANALYSIS', headers, rows);
  }
  if (selected.compliance) {
    push('07 COMPLIANCE CHECKLIST', ['No', 'Area', 'Requirement', 'Evidence', 'Status', 'Due date', 'Note'],
      data.compliance.map((row) => [row.id, row.area, row.requirement, row.detail, row.status, row.due_date, row.note]));
  }
  if (selected.recommendations) {
    push('08 FINAL RECOMMENDATIONS', ['Topic', 'Recommendation'], derived.recommendations);
  }
  return blocks.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function downloadCsv(content) {
  const blob = new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sludge-smart-report-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function downloadPdf(selected, data, derived) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210;
  const margin = 16;
  let y = 18;

  const newPageIfNeeded = (height) => {
    if (y + height > 280) { doc.addPage(); y = 18; }
  };
  const text = (value, size = 9, bold = false, color = [17, 17, 17]) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    return String(value ?? '');
  };
  const line = (value, size = 9, bold = false, color = [17, 17, 17], gap = 5) => {
    newPageIfNeeded(gap);
    doc.text(text(value, size, bold, color), margin, y);
    y += gap;
  };
  const rule = () => {
    newPageIfNeeded(3);
    doc.setDrawColor(17, 17, 17);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageW - margin, y);
    y += 3;
  };
  const paragraph = (value, size = 9) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(value), pageW - margin * 2);
    lines.forEach((part) => line(part, size, false, [17, 17, 17], 4.5));
  };
  const table = (headers, rows, widths) => {
    const colWidths = widths || headers.map(() => (pageW - margin * 2) / headers.length);
    const drawHeader = () => {
      newPageIfNeeded(9);
      doc.setFillColor(242, 242, 242);
      doc.rect(margin, y - 4, pageW - margin * 2, 7, 'F');
      let x = margin;
      headers.forEach((header, index) => {
        doc.text(text(String(header).slice(0, 26), 6.5, true), x + 1, y);
        x += colWidths[index];
      });
      y += 7;
    };
    drawHeader();
    rows.forEach((row) => {
      newPageIfNeeded(7);
      let x = margin;
      row.forEach((cell, index) => {
        doc.text(text(String(cell ?? ''), 6.5, false), x + 1, y);
        x += colWidths[index] || 20;
      });
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, y + 1.5, pageW - margin, y + 1.5);
      y += 5;
    });
    y += 3;
  };

  doc.setFillColor(227, 6, 19);
  doc.rect(margin, y - 8, 8, 8, 'F');
  line('SLUDGE SMART', 22, true);
  line('INDUSTRIAL ETP SLUDGE MANAGEMENT REPORT', 10, true, [155, 155, 155]);
  line(`Generated: ${new Date().toLocaleString('en-IN')}   |   Records: ${data.generation.length + data.characterisation.length + data.handling.length}`, 8, false, [155, 155, 155], 8);
  paragraph('Sample records are illustrative. They are not actual laboratory results or regulatory limits. Engineering calculations are estimates and require site verification.');
  rule();

  if (selected.generation) {
    line('01  SLUDGE GENERATION ANALYSIS', 13, true);
    const latest = derived.generation[0];
    if (latest) {
      paragraph(`Latest log ${latest.date}: wastewater ${int(latest.wastewater_m3)} m3/day; wet sludge ${int(latest.wet)} kg/day; moisture ${num(latest.moisture_pct)}%; dry solids ${num(latest.dry)} kg/day; generation rate ${num(latest.rate, 3)} kgDS/m3.`);
      paragraph(`Projection: ${int(latest.monthly)} kg/month and ${int(latest.annual)} kg/year wet sludge at ${latest.operating_days} operating days per month.`);
    }
    table(['Date', 'm3/d', 'Wet kg', 'Moist %', 'Dry kg', 'Rate', 'Source'],
      derived.generation.slice(0, 12).map((r) => [r.date, int(r.wastewater_m3), int(r.wet), num(r.moisture_pct), num(r.dry), num(r.rate, 3), r.source]),
      [30, 22, 25, 23, 25, 30, 39]);
  }
  if (selected.characterisation) {
    line('02  CHARACTERISATION RESULTS', 13, true);
    paragraph('Values are user-entered or illustrative sample data. Missing values are shown as N/A; unusual results are screening flags only, not limit exceedances.');
    table(['Date', 'Sample', 'pH', 'Moist%', 'TS%', 'VS%', 'Pb', 'Cr', 'Cd', 'Ni'],
      data.characterisation.slice(0, 12).map((r) => [r.date, r.sample_id, num(r.ph, 1), num(r.moisture_pct), num(r.total_solids_pct), num(r.volatile_solids_pct), num(r.lead_mgkg, 1), num(r.chromium_mgkg, 1), num(r.cadmium_mgkg, 1), num(r.nickel_mgkg, 1)]),
      [24, 26, 14, 19, 16, 16, 15, 15, 15, 20]);
  }
  if (selected.handling || selected.reduction) {
    line(selected.reduction ? '03 / 04  HANDLING PERFORMANCE & VOLUME REDUCTION' : '03  SLUDGE HANDLING PERFORMANCE', 13, true);
    paragraph('Mass balance assumes complete dry-solids retention; only water is removed. Solids losses are not modelled.');
    table(['Date', 'Technology', 'Initial kg', 'Initial %', 'Final %', 'DS kg', 'Final kg', 'Reduction %'],
      derived.handling.slice(0, 14).map((r) => [r.date, r.technology, num(r.initial_mass_kg, 0), num(r.initial_moisture_pct), num(r.final_moisture_pct), num(r.dryRetained), num(r.finalMass), num(r.reduction)]),
      [24, 42, 22, 21, 19, 22, 24, 22]);
  }
  if (selected.technology || selected.cost) {
    line(selected.cost ? '05 / 06  TECHNOLOGY COMPARISON & COST ANALYSIS' : '05  TECHNOLOGY COMPARISON', 13, true);
    paragraph('Weighted score is calculated from user-assigned criterion weights and 1–5 scores. Cost figures are indicative planning estimates only.');
    table(['Rank', 'Technology', 'Group', 'Score', 'Capex L', 'Opex L/y', 'kWh/t', 'kg chem/t', 'm2'],
      derived.technology.slice(0, 10).map((r, i) => [i + 1, r.name, r.group, num(r.score, 2), int(r.capexLakh), num(r.opexLakhYear), int(r.energyKwhTon), int(r.chemicalKgTon), int(r.spaceM2)]),
      [14, 44, 24, 18, 22, 24, 20, 24, 16]);
  }
  if (selected.compliance) {
    line('07  COMPLIANCE CHECKLIST', 13, true);
    paragraph('Statuses are user-maintained internal readiness indicators and do not certify legal compliance.');
    table(['No', 'Area', 'Status', 'Due', 'Note'],
      data.compliance.map((r) => [r.id, r.area, r.status, r.due_date || '—', (r.note || '').slice(0, 34)]),
      [12, 54, 40, 26, 64]);
  }
  if (selected.recommendations) {
    line('08  FINAL RECOMMENDATIONS', 13, true);
    derived.recommendations.forEach(([topic, recommendation]) => {
      line(topic.toUpperCase(), 9, true, [227, 6, 19]);
      paragraph(recommendation);
    });
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(155, 155, 155);
    doc.text('SLUDGE SMART — ENGINEERING ESTIMATES — VERIFY BEFORE REGULATORY USE', margin, 288);
    doc.text(`${page} / ${pages}`, pageW - margin, 288, { align: 'right' });
  }
  doc.save(`sludge-smart-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export default function Reports() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(Object.fromEntries(SECTIONS.map((section) => [section.key, true])));
  const [status, setStatus] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      setData(await reportData());
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
    return { generation, handling, technology, recommendations };
  }, [data]);

  const toggle = (key) => setSelected((current) => ({ ...current, [key]: !current[key] }));

  if (loading || !data || !derived) {
    return (
      <div className="page">
        <PageHeader number="07" kicker="MODULE / EXPORT" title={<>REPORTS &amp;<br />EXPORTS</>} subtitle="Preparing report data…" />
        <p className="empty-state">{error || 'Loading records from the data store…'}</p>
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

      <SectionTitle number="01" title="SELECT REPORT SECTIONS" note="Only selected sections are included in PDF and CSV exports." />
      <div className="grid-2 grid-equal">
        <Panel label="CONFIG / 01" title="REPORT CONTENT">
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
              try { await downloadPdf(selected, data, derived); setStatus('PDF downloaded.'); }
              catch (err) { setStatus(`PDF failed: ${err.message}`); }
            }}>DOWNLOAD PDF ↓</Button>
            <Button variant="secondary" onClick={() => {
              downloadCsv(buildCsv(selected, data, derived));
              setStatus('CSV downloaded.');
            }}>DOWNLOAD CSV ↓</Button>
            <Button variant="ghost" onClick={refresh}>REFRESH DATA</Button>
          </div>
          {status && <p className="form-message">{status}</p>}
        </Panel>

        <Panel label="PREVIEW / 01" title="REPORT SUMMARY">
          <div className="report-summary">
            <div><span>GENERATION RECORDS</span><strong className="red">{String(derived.generation.length).padStart(2, '0')}</strong></div>
            <div><span>LAB RECORDS</span><strong>{String(data.characterisation.length).padStart(2, '0')}</strong></div>
            <div><span>HANDLING RUNS</span><strong>{String(derived.handling.length).padStart(2, '0')}</strong></div>
            <div><span>TECHNOLOGIES</span><strong>{String(derived.technology.length).padStart(2, '0')}</strong></div>
          </div>
          <p className="panel-footnote">PDF is generated in the browser with monochrome Swiss-style tables. CSV contains the same selected data in flat tables.</p>
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
        <Panel label={selected.reduction ? '03 / 04' : '03 / ANALYSIS'} title={selected.reduction ? 'HANDLING PERFORMANCE & VOLUME REDUCTION' : 'HANDLING PERFORMANCE'}>
          <DataTable
            rows={derived.handling}
            columns={[
              { key: 'date', label: 'DATE', render: (row) => shortDate(row.date) },
              { key: 'technology', label: 'TECHNOLOGY' },
              { key: 'initial_mass_kg', label: 'INITIAL KG', align: 'right', render: (row) => int(row.initial_mass_kg) },
              { key: 'final_mass', label: 'FINAL KG', align: 'right', render: (row) => num(row.finalMass) },
              { key: 'dryRetained', label: 'DS RETAINED', align: 'right', render: (row) => num(row.dryRetained) },
              { key: 'reduction', label: 'REDUCTION', align: 'right', render: (row) => `${num(row.reduction)} %` },
            ]}
            searchFields={['technology', 'date']}
          />
        </Panel>
      )}

      {(selected.technology || selected.cost) && (
        <Panel label={selected.cost ? '05 / 06' : '05 / ANALYSIS'} title={selected.cost ? 'TECHNOLOGY COMPARISON & COST ANALYSIS' : 'TECHNOLOGY COMPARISON'}>
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
        <Panel label="07 / ANALYSIS" title="COMPLIANCE CHECKLIST">
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
        <Panel label="08 / CONCLUSION" title="FINAL RECOMMENDATIONS">
          <div className="recommendation-list">
            {derived.recommendations.map(([topic, text]) => (
              <div className="recommendation-row" key={topic}>
                <span>{topic.toUpperCase()}</span>
                <p>{text}</p>
              </div>
            ))}
          </div>
          <Field label="REPORT NOTE" hint="Recommendations are generated from the current dataset and must be reviewed by qualified personnel.">
            <textarea className="input textarea" rows={3} placeholder="Add internal review comments here (not included in exported files)." />
          </Field>
        </Panel>
      )}
    </div>
  );
}
