import { Link } from 'react-router-dom';
import { BarComparisonChart, TrendChart } from '../components/Charts.jsx';
import { Badge, DataState, DataTable, Metric, PageHeader, Panel, SectionTitle, StatusPill } from '../components/UI.jsx';
import { useCollection } from '../hooks/useData.js';
import { generationMetrics, int, num, shortDate } from '../lib/calc.js';

const byDate = (a, b) => String(a.date).localeCompare(String(b.date));

export default function Dashboard() {
  const generation = useCollection('generation');
  const lab = useCollection('lab');
  const disposal = useCollection('disposal');
  const compliance = useCollection('compliance');

  const genRows = [...generation.data].sort(byDate);
  const latest = [...generation.data].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  const metrics = latest ? generationMetrics(latest) : null;

  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthDisposals = disposal.data.filter((row) => row.date?.startsWith(currentMonth));
  const disposalQty = monthDisposals.reduce((sum, row) => sum + Number(row.quantity_kg || 0), 0);

  const trend = genRows.map((row) => {
    const m = generationMetrics(row);
    return { date: row.date, wet: m.wet, dry: m.dry, rate: m.rate, moisture: row.moisture_pct };
  });

  const complianceCounts = {
    ok: compliance.data.filter((row) => row.status === 'Compliant').length,
    action: compliance.data.filter((row) => row.status === 'Action required').length,
    missing: compliance.data.filter((row) => row.status === 'Information missing').length,
  };

  const labRecent = [...lab.data].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5);
  const disposalRecent = [...disposal.data].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5);
  const sampleOnly = genRows.length > 0 && genRows.every((row) => row.source === 'sample');
  const loadError = generation.error || lab.error || disposal.error || compliance.error;

  return (
    <div className="page">
      <PageHeader
        number="01"
        kicker="SYSTEM OVERVIEW / ETP"
        title={<>SLUDGE<br /><span className="red">SMART</span></>}
        subtitle="Industrial wastewater sludge management and monitoring system — from generation to final disposal."
        meta={[
          { label: 'PLANT TYPE', value: 'INDUSTRIAL ETP' },
          { label: 'DATA PERIOD', value: latest ? `${shortDate(trend[0]?.date)} — ${shortDate(latest.date)}` : '—' },
          { label: 'RECORDS', value: String(genRows.length + lab.data.length + disposal.data.length).padStart(3, '0') },
        ]}
      />

      <div className="status-strip">
        <div className="status-strip-item">
          <span className="strip-number">01</span>
          <span className="strip-label">DATA SOURCE</span>
          <strong>SAMPLE + USER ENTRIES</strong>
        </div>
        <div className="status-strip-item">
          <span className="strip-number">02</span>
          <span className="strip-label">LATEST LOG</span>
          <strong>{latest ? shortDate(latest.date) : 'NO DATA'}</strong>
        </div>
        <div className="status-strip-item">
          <span className="strip-number">03</span>
          <span className="strip-label">COMPLIANCE CHECKPOINTS</span>
          <strong>{complianceCounts.ok} OK / {complianceCounts.action} ACTION / {complianceCounts.missing} MISSING</strong>
        </div>
        <div className="status-strip-item strip-red">
          <span className="strip-number">04</span>
          <span className="strip-label">NOTE</span>
          <strong>ESTIMATES ONLY — VERIFY DATA</strong>
        </div>
      </div>
      {loadError && <p className="data-status data-status-error">{loadError}</p>}

      <SectionTitle
        number="01"
        title="KEY OPERATING FIGURES"
        note={`Values from the most recent logged operating day${latest ? ` · ${shortDate(latest.date)}` : ''}. Sample records are illustrative.`}
      />
      <div className="metric-grid metric-grid-6">
        <Metric label="WASTEWATER TREATED" value={latest ? int(latest.wastewater_m3) : '—'} unit="m³/day" note="Latest operating day" accent />
        <Metric label="WET SLUDGE GENERATED" value={latest ? int(latest.wet_sludge_kg) : '—'} unit="kg/day" note="As logged in generation module" />
        <Metric label="DRY SOLIDS GENERATED" value={metrics ? num(metrics.dry) : '—'} unit="kg/day" note="Wet mass × dry solids fraction" />
        <Metric label="MOISTURE CONTENT" value={latest ? num(latest.moisture_pct) : '—'} unit="%" note="Measured sludge moisture" />
        <Metric label="GENERATION RATE" value={metrics ? num(metrics.rate, 3) : '—'} unit="kgDS/m³" note="Dry solids / wastewater treated" />
        <Metric label="SLUDGE DISPOSAL QTY" value={int(disposalQty)} unit="kg" note={`${monthDisposals.length} consignments · ${currentMonth || '—'}`} accent />
      </div>

      <SectionTitle
        number="02"
        title="TREND ANALYSIS"
        note="Chronological view of logged sludge generation and moisture. Hover for exact values."
      />
      <div className="grid-2">
        <Panel label="FIG. 01" title="SLUDGE GENERATION TREND" action={<Badge>{sampleOnly ? 'SAMPLE DATA' : 'SAMPLE + USER DATA'}</Badge>}>
          <DataState loading={generation.loading} error={generation.error} empty={!trend.length}>
            <TrendChart
              data={trend}
              series={[
                { key: 'wet', name: 'Wet sludge (kg/d)', color: '#E30613' },
                { key: 'dry', name: 'Dry solids (kg/d)', color: '#111111' },
              ]}
              unit="kg/day"
            />
            <div className="chart-legend">
              <span><i style={{ background: '#E30613' }} />WET SLUDGE</span>
              <span><i style={{ background: '#111111' }} />DRY SOLIDS</span>
            </div>
          </DataState>
        </Panel>
        <Panel label="FIG. 02" title="MOISTURE TREND" action={<Badge>{sampleOnly ? 'SAMPLE DATA' : 'SAMPLE + USER DATA'}</Badge>}>
          <DataState loading={generation.loading} error={generation.error} empty={!trend.length}>
            <TrendChart
              data={trend}
              series={[{ key: 'moisture', name: 'Moisture (%)', color: '#E30613' }]}
              unit="%"
              domain={[90, 97]}
              reference={{ value: 94, label: '94% GUIDE' }}
            />
            <p className="panel-footnote">Guide line is a visual aid, not a regulatory limit.</p>
          </DataState>
        </Panel>
      </div>

      <SectionTitle
        number="03"
        title="RECENT RECORDS"
        note="Latest laboratory tests and off-site sludge consignments."
      />
      <div className="grid-2">
        <Panel
          label="LAB / 03"
          title="RECENT LABORATORY RECORDS"
          action={<Link className="text-link" to="/characterisation">OPEN MODULE →</Link>}
        >
          <DataState loading={lab.loading} error={lab.error} empty={!labRecent.length}>
            <DataTable
              rows={labRecent}
              columns={[
                { key: 'date', label: 'DATE', render: (row) => shortDate(row.date) },
                { key: 'sample_id', label: 'SAMPLE ID' },
                { key: 'ph', label: 'pH', align: 'right', render: (row) => num(row.ph, 1) },
                { key: 'moisture_pct', label: 'MOIST %', align: 'right', render: (row) => num(row.moisture_pct) },
                { key: 'cadmium_mgkg', label: 'Cd', align: 'right', render: (row) => row.cadmium_mgkg == null ? <span className="muted">MISSING</span> : num(row.cadmium_mgkg, 1) },
                { key: 'source', label: 'SOURCE', render: (row) => <StatusPill status={row.source === 'sample' ? 'Sample' : 'User'} /> },
              ]}
              searchPlaceholder="Search lab records…"
              searchFields={['sample_id', 'date']}
            />
          </DataState>
        </Panel>
        <Panel
          label="DISPOSAL / 06"
          title="RECENT SLUDGE DISPOSAL RECORDS"
          action={<Link className="text-link" to="/compliance">OPEN MODULE →</Link>}
        >
          <DataState loading={disposal.loading} error={disposal.error} empty={!disposalRecent.length}>
            <DataTable
              rows={disposalRecent}
              columns={[
                { key: 'date', label: 'DATE', render: (row) => shortDate(row.date) },
                { key: 'quantity_kg', label: 'QUANTITY', align: 'right', render: (row) => `${int(row.quantity_kg)} kg` },
                { key: 'facility', label: 'FACILITY' },
                { key: 'manifest_no', label: 'MANIFEST' },
              ]}
              searchPlaceholder="Search dispatches…"
              searchFields={['facility', 'manifest_no', 'date']}
            />
          </DataState>
        </Panel>
      </div>

      <SectionTitle number="04" title="SYSTEM SUMMARY" note="Quick read on sludge reduction performance logged to date." />
      <div className="grid-2">
        <Panel label="FIG. 03" title="CUMULATIVE SLUDGE BY STAGE" action={<Badge>ENGINEERING ESTIMATE</Badge>}>
          <BarComparisonChart
            data={[
              { name: 'Generated (kg/d)', value: metrics?.wet || 0 },
              { name: 'Dry solids (kg/d)', value: metrics?.dry || 0 },
              { name: 'Disposed (kg/month)', value: disposalQty },
            ]}
            xKey="name"
            bars={[{ key: 'value', name: 'MASS (KG)', color: '#E30613', size: 18 }]}
            height={220}
            unit="kg"
          />
        </Panel>
        <Panel label="NOTE / 04" title="HOW TO USE THIS SYSTEM">
          <ol className="numbered-list">
            <li><strong>01</strong><span>Log daily wastewater, wet sludge and moisture in <Link to="/generation">Sludge Generation</Link>.</span></li>
            <li><strong>02</strong><span>Enter laboratory results and review unusual values in <Link to="/characterisation">Characterisation</Link>.</span></li>
            <li><strong>03</strong><span>Model thickening, dewatering and drying in <Link to="/handling">Sludge Handling</Link>.</span></li>
            <li><strong>04</strong><span>Weight your priorities and compare options in <Link to="/technology">Technology Selection</Link>.</span></li>
            <li><strong>05</strong><span>Maintain evidence in <Link to="/compliance">Compliance</Link> and export via <Link to="/reports">Reports</Link>.</span></li>
          </ol>
          <p className="panel-footnote">Sample data is labelled throughout. It must not be used as actual test results or as proof of regulatory limits.</p>
        </Panel>
      </div>
    </div>
  );
}
