import { useEffect, useMemo, useState } from 'react';
import { BarComparisonChart } from '../components/Charts.jsx';
import { Button, Callout, DataTable, KeyValue, PageHeader, Panel, SectionTitle } from '../components/UI.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { CRITERIA, TECHNOLOGIES } from '../data/technologies.js';
import { useCollection, useSettings } from '../hooks/useData.js';
import { int, matrixResults, normalizeWeights, num } from '../lib/calc.js';
import { can } from '../lib/permissions.js';
import { annualWetTonnesFromGeneration, sanitizeScore, sanitizeWeight } from '../lib/technology.js';

export default function Technology() {
  const { user } = useAuth();
  const canWrite = can(user, 'technology:write');
  const { settings, loading, error, save } = useSettings();
  const generation = useCollection('generation');
  const [draft, setDraft] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!settings) return;
    setDraft((current) => {
      if (current?.updated_at && current.updated_at === settings.updated_at) return current;
      return structuredClone(settings);
    });
  }, [settings]);

  const results = useMemo(() => draft ? matrixResults(draft) : [], [draft]);
  const totalWeight = draft ? CRITERIA.reduce((sum, c) => sum + Number(draft.weights[c.key] || 0), 0) : 0;
  const topPriorities = draft
    ? [...CRITERIA].sort((a, b) => Number(draft.weights[b.key] || 0) - Number(draft.weights[a.key] || 0)).slice(0, 3)
    : [];

  const annualWetTonnes = annualWetTonnesFromGeneration(generation.data);

  if (loading) {
    return <div className="page"><p className="data-status">Loading decision matrix…</p></div>;
  }
  if (!draft) {
    return <div className="page"><p className="data-status data-status-error">{error || 'No decision matrix is available.'}</p></div>;
  }

  const setWeight = (key, value) => {
    setDraft((current) => ({ ...current, weights: { ...current.weights, [key]: sanitizeWeight(value) } }));
    setMessage('');
  };

  const setScore = (techId, key, value) => {
    const parsed = sanitizeScore(value);
    setDraft((current) => {
      if (!current?.scores?.[techId]) return current;
      return {
        ...current,
        scores: {
          ...current.scores,
          [techId]: { ...current.scores[techId], [key]: parsed },
        },
      };
    });
    setMessage('');
  };

  const handleSave = async () => {
    const payload = { weights: draft.weights, scores: draft.scores };
    try {
      const saved = await save(payload);
      setDraft(structuredClone(saved));
      setMessage('Decision matrix saved.');
    } catch (error) {
      setMessage(`Could not save: ${error.message}`);
    }
  };

  const winner = results[0];
  const runnerUp = results[1];

  return (
    <div className="page">
      <PageHeader
        number="05"
        kicker="MODULE / DECISION SUPPORT"
        title={<>TECHNOLOGY<br />SELECTION</>}
        subtitle="Weighted decision matrix for comparing sludge management technologies against your site priorities."
        meta={[
          { label: 'CRITERIA', value: String(CRITERIA.length).padStart(2, '0') },
          { label: 'OPTIONS', value: String(TECHNOLOGIES.length).padStart(2, '0') },
          { label: 'TOTAL WEIGHT', value: String(totalWeight).padStart(3, '0') },
        ]}
      />

      <Callout title="DECISION SUPPORT — NOT A CERTIFICATION">
        Scores are user-assessed (1 = least favourable, 5 = most favourable). Cost, energy, chemical and space figures are
        illustrative planning estimates from the shipped technology reference table, not quotations or verified site data.
        The recommendation is a comparison aid; site trials, vendor confirmation and regulatory review remain necessary.
      </Callout>
      {error && <p className="data-status data-status-error">{error}</p>}

      <SectionTitle
        number="01"
        title="WEIGHT CRITERIA"
        note="Adjust weights to reflect site priorities. Scores are normalised to the total weight for ranking."
        action={<Button variant="secondary" onClick={() => { setDraft((current) => ({ ...current, weights: normalizeWeights(current.weights) })); setMessage(''); }}>NORMALISE TO 100</Button>}
      />
      <Panel label="INPUT / 01" title="PRIORITY WEIGHTS">
        <div className="weight-grid">
          {CRITERIA.map((criterion) => (
            <div className="weight-item" key={criterion.key}>
              <div className="weight-head">
                <span>{criterion.label.toUpperCase()}</span>
                <strong className="red">{String(draft.weights[criterion.key] ?? 0).padStart(2, '0')}</strong>
              </div>
              <input
                type="range" min="0" max="30" step="1"
                value={draft.weights[criterion.key] ?? 0}
                onChange={(event) => setWeight(criterion.key, event.target.value)}
                aria-label={`${criterion.label} weight`}
              />
            </div>
          ))}
        </div>
        <div className="form-actions">
          {canWrite && <Button onClick={handleSave}>SAVE MATRIX →</Button>}
          {!canWrite && <span className="form-message inline message-error">READ ONLY — ADMINISTRATOR ROLE REQUIRED TO SAVE.</span>}
          {message && <span className={`form-message inline ${message.startsWith('Could') ? 'message-error' : ''}`}>{message}</span>}
        </div>
      </Panel>

      <SectionTitle number="02" title="WEIGHTED DECISION MATRIX" note="Edit any score from 1 to 5. The highest weighted total is highlighted." />
      <Panel label="MATRIX / 01" title="TECHNOLOGY SCORING" action={<BadgeText>1 = LOW · 5 = HIGH</BadgeText>}>
        <div className="matrix-scroll">
          <table className="matrix-table">
            <colgroup>
              <col className="matrix-tech-col" />
              {CRITERIA.map((criterion) => <col key={criterion.key} className="matrix-criterion-col" />)}
              <col className="matrix-score-col" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className="matrix-tech-col">TECHNOLOGY</th>
                {CRITERIA.map((criterion) => <th scope="col" key={criterion.key} className="matrix-criterion-col">{criterion.short}</th>)}
                <th scope="col" className="matrix-score-col">WEIGHTED / 5</th>
              </tr>
              <tr className="matrix-weight-row">
                <th scope="col" className="matrix-tech-col">APPLIED WEIGHT</th>
                {CRITERIA.map((criterion) => <th scope="col" key={criterion.key} className="matrix-criterion-cell">{draft.weights[criterion.key]}</th>)}
                <th scope="col" className="matrix-score-cell">Σ {totalWeight}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((tech, index) => (
                <tr key={tech.id} className={index === 0 ? 'matrix-best' : ''}>
                  <th scope="row" className="matrix-tech-col">
                    <strong>{tech.name}</strong>
                    <span className="matrix-group">{tech.group}</span>
                  </th>
                  {CRITERIA.map((criterion) => (
                    <td key={criterion.key} className="matrix-criterion-cell">
                      <input
                        className="score-input"
                        type="number" min="1" max="5" step="1"
                        inputMode="numeric"
                        value={draft.scores[tech.id]?.[criterion.key] ?? 1}
                        onChange={(event) => setScore(tech.id, criterion.key, event.target.value)}
                        aria-label={`${tech.name} ${criterion.label} score`}
                      />
                    </td>
                  ))}
                  <td className="matrix-score-cell"><strong className={index === 0 ? 'red' : ''}>{num(tech.score, 2)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <SectionTitle number="03" title="RECOMMENDATION" note="Ranking reflects the weights and scores currently entered — save to keep this matrix." />
      <div className="grid-2">
        <Panel label="RESULT / 01" title="SUGGESTED OPTION" className="recommendation-panel">
          {winner && (
            <>
              <div className="recommendation-name">{winner.name}</div>
              <div className="recommendation-score"><span className="red">{num(winner.score, 2)}</span><em>/ 5 WEIGHTED SCORE</em></div>
              <div className="recommendation-detail">
                <KeyValue label="PROCESS GROUP" value={winner.group.toUpperCase()} />
                <KeyValue label="TYPICAL FINAL MOISTURE" value={`${winner.finalMoisture} %`} />
                <KeyValue label="INDICATIVE CAPEX" value={`₹ ${winner.capexLakh} LAKH`} />
                <KeyValue label="INDICATIVE OPEX" value={`₹ ${num(winner.opexLakhYear)} LAKH/YR`} accent />
                <KeyValue label="RUNNER-UP" value={`${runnerUp?.name || '—'} (${num(runnerUp?.score || 0, 2)})`} />
              </div>
              <p className="panel-footnote">
                Highest-priority criteria: {topPriorities.map((item) => `${item.label} (${draft.weights[item.key]})`).join(' · ')}.
                Confirm feasibility with a site-specific engineering assessment before procurement.
              </p>
            </>
          )}
        </Panel>
        <Panel label="FIG. 01" title="WEIGHTED SCORE RANKING">
          <BarComparisonChart
            data={results.map((tech) => ({ name: tech.name, score: Number(tech.score.toFixed(2)) }))}
            xKey="name"
            bars={[{ key: 'score', name: 'WEIGHTED SCORE / 5', color: '#E30613', size: 12 }]}
            height={360}
          />
        </Panel>
      </div>

      <SectionTitle number="04" title="COST & RESOURCE INDICATORS" note={`Annual basis: ${num(annualWetTonnes, 0)} t/year wet sludge projected from the latest generation record. Reference figures require site verification.`} />
      {generation.error && <p className="data-status data-status-error">{generation.error}</p>}
      <Panel label="TABLE / 01" title="INDICATIVE RESOURCE COMPARISON">
        <DataTable
          rows={results.map((tech) => ({
            ...tech,
            fiveYear: tech.capexLakh + tech.opexLakhYear * 5,
            annualEnergy: annualWetTonnes * tech.energyKwhTon,
            annualChemical: annualWetTonnes * tech.chemicalKgTon,
          }))}
          columns={[
            { key: 'name', label: 'TECHNOLOGY' },
            { key: 'group', label: 'STAGE' },
            { key: 'capexLakh', label: 'CAPEX ₹ LAKH', align: 'right', render: (row) => int(row.capexLakh) },
            { key: 'opexLakhYear', label: 'OPEX ₹ LAKH/YR', align: 'right', render: (row) => num(row.opexLakhYear) },
            { key: 'fiveYear', label: '5-YR ₹ LAKH', align: 'right', render: (row) => int(row.fiveYear) },
            { key: 'annualEnergy', label: 'ENERGY KWH/YR', align: 'right', render: (row) => int(row.annualEnergy) },
            { key: 'annualChemical', label: 'CHEMICAL KG/YR', align: 'right', render: (row) => int(row.annualChemical) },
            { key: 'spaceM2', label: 'SPACE m²', align: 'right', render: (row) => int(row.spaceM2) },
          ]}
          searchFields={['name', 'group']}
        />
      </Panel>
    </div>
  );
}

function BadgeText({ children }) {
  return <span className="panel-action-note">{children}</span>;
}
