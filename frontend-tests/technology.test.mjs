import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CRITERIA, HANDLING_OPTIONS, TECHNOLOGIES } from '../src/data/technologies.js';
import { generationMetrics, matrixResults, normalizeWeights, num } from '../src/lib/calc.js';
import { annualWetTonnesFromGeneration, sanitizeScore, sanitizeWeight } from '../src/lib/technology.js';

const sample = JSON.parse(readFileSync(new URL('../shared/sample-data.json', import.meta.url), 'utf8'));
const pageSource = readFileSync(new URL('../src/pages/Technology.jsx', import.meta.url), 'utf8');
const uiSource = readFileSync(new URL('../src/components/UI.jsx', import.meta.url), 'utf8');
const criteriaKeys = CRITERIA.map((criterion) => criterion.key);
const technologyIds = TECHNOLOGIES.map((tech) => tech.id);

const close = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} is not within ${tolerance} of ${expected}`);
};

test('catalogue has nine criteria and ten technologies in three process groups', () => {
  assert.deepEqual(criteriaKeys, [
    'feasibility', 'capex', 'opex', 'energy', 'chemical',
    'space', 'dewatering', 'maintenance', 'environmental',
  ]);
  assert.equal(TECHNOLOGIES.length, 10);
  assert.deepEqual(technologyIds, [
    'gravity-thickener', 'daf', 'mechanical-thickener',
    'filter-press', 'belt-filter-press', 'centrifuge', 'screw-press',
    'solar-drying', 'thermal-drying', 'waste-heat-drying',
  ]);
  assert.deepEqual(
    Object.keys(HANDLING_OPTIONS),
    ['Thickening', 'Dewatering', 'Drying'],
  );
  assert.equal(TECHNOLOGIES.filter((tech) => tech.group === 'Thickening').length, 3);
  assert.equal(TECHNOLOGIES.filter((tech) => tech.group === 'Dewatering').length, 4);
  assert.equal(TECHNOLOGIES.filter((tech) => tech.group === 'Drying').length, 3);
});

test('sample settings align with catalogue criteria and technologies', () => {
  assert.deepEqual(Object.keys(sample.technology.weights), criteriaKeys);
  assert.deepEqual(Object.keys(sample.technology.scores), technologyIds);
  for (const tech of TECHNOLOGIES) {
    assert.deepEqual(Object.keys(sample.technology.scores[tech.id]), criteriaKeys);
    for (const score of Object.values(sample.technology.scores[tech.id])) {
      assert.ok(Number.isInteger(score) && score >= 1 && score <= 5);
    }
    for (const field of ['finalMoisture', 'capexLakh', 'opexLakhYear', 'energyKwhTon', 'chemicalKgTon', 'spaceM2']) {
      assert.ok(Number.isFinite(tech[field]), `${tech.id} missing ${field}`);
      assert.ok(tech[field] >= 0, `${tech.id} has negative ${field}`);
    }
  }
});

test('normalizeWeights distributes exactly 100 and handles zero/invalid weights safely', () => {
  const normalized = normalizeWeights(sample.technology.weights);
  assert.deepEqual(Object.keys(normalized), criteriaKeys);
  assert.equal(Object.values(normalized).reduce((sum, value) => sum + value, 0), 100);
  assert.ok(Object.values(normalized).every(Number.isInteger));

  const allZero = normalizeWeights(Object.fromEntries(criteriaKeys.map((key) => [key, 0])));
  assert.equal(Object.values(allZero).reduce((sum, value) => sum + value, 0), 100);
  assert.equal(allZero.feasibility, 12);
  assert.ok(criteriaKeys.slice(1).every((key) => allZero[key] === 11));

  const invalid = normalizeWeights({ feasibility: -5, capex: Number.NaN, opex: Infinity });
  assert.equal(Object.values(invalid).reduce((sum, value) => sum + value, 0), 100);
  assert.ok(Object.values(invalid).every((value) => value >= 0));
});

test('weighted score formula, winner, runner-up and stable ties', () => {
  const results = matrixResults(sample.technology);
  assert.equal(results.length, 10);
  const totalWeight = Object.values(sample.technology.weights).reduce((sum, value) => sum + value, 0);
  for (const tech of results) {
    const weighted = criteriaKeys.reduce(
      (sum, key) => sum + sample.technology.weights[key] * sample.technology.scores[tech.id][key],
      0,
    );
    close(tech.score, weighted / totalWeight);
  }
  assert.equal(results[0].id, 'solar-drying');
  assert.equal(results[1].id, 'gravity-thickener');

  const tied = matrixResults({
    weights: sample.technology.weights,
    scores: Object.fromEntries(technologyIds.map((id) => [id, Object.fromEntries(criteriaKeys.map((key) => [key, 1]))])),
  });
  assert.deepEqual(tied.map((tech) => tech.id), technologyIds);
});

test('ranking updates immediately when weights or scores change', () => {
  const onlyCapital = {
    weights: Object.fromEntries(criteriaKeys.map((key) => [key, key === 'capex' ? 100 : 0])),
    scores: sample.technology.scores,
  };
  const byCapital = matrixResults(onlyCapital);
  assert.equal(byCapital[0].id, 'gravity-thickener');
  assert.equal(byCapital[1].id, 'solar-drying');

  const changed = structuredClone(sample.technology);
  for (const key of criteriaKeys) changed.scores.centrifuge[key] = 5;
  assert.equal(matrixResults(changed)[0].id, 'centrifuge');
});

test('recommendation uses saved matrix after save and reload', () => {
  const initial = structuredClone(sample.technology);
  const edited = structuredClone(initial);
  for (const key of criteriaKeys) edited.weights[key] = key === 'capex' ? 100 : 0;
  for (const key of criteriaKeys) edited.scores['gravity-thickener'][key] = 5;
  for (const key of criteriaKeys) edited.scores['solar-drying'][key] = 1;

  const before = matrixResults(initial);
  const after = matrixResults(edited);
  assert.notEqual(after[0].id, before[0].id);
  assert.equal(after[0].id, 'gravity-thickener');
  assert.equal(after[1].id, matrixResults(edited)[1].id);

  const savedResponse = { ...edited, updated_at: '2026-11-28T00:00:00+00:00' };
  const reloaded = matrixResults({ weights: savedResponse.weights, scores: savedResponse.scores });
  assert.equal(reloaded[0].id, 'gravity-thickener');
  assert.equal(reloaded[0].group, 'Thickening');
  assert.equal(reloaded[0].capexLakh, 90);
  assert.equal(reloaded[0].opexLakhYear, 12);
  assert.ok(pageSource.includes('const saved = await save(payload);'));
  assert.ok(pageSource.includes('setDraft(structuredClone(saved));'));
});

test('live score edits update matrix, ranking and recommendation; save/reload preserve result', () => {
  const draft = structuredClone(sample.technology);
  const before = matrixResults(draft);
  assert.equal(before[0].id, 'solar-drying');

  for (const key of criteriaKeys) draft.scores['solar-drying'][key] = 1;
  for (const key of criteriaKeys) {
    assert.equal(draft.scores['solar-drying'][key], 1, `solar-drying ${key} should be edited`);
  }

  const after = matrixResults(draft);
  const solar = after.find((tech) => tech.id === 'solar-drying');
  const expectedSolar = criteriaKeys.reduce((sum, key) => sum + draft.weights[key] * 1, 0)
    / criteriaKeys.reduce((sum, key) => sum + draft.weights[key], 0);
  close(solar.score, expectedSolar);
  assert.notEqual(after[0].id, 'solar-drying');
  assert.equal(after[0].id, 'gravity-thickener');
  assert.equal(after[0].name, 'Gravity thickener');

  const saved = { weights: draft.weights, scores: draft.scores, updated_at: '2026-11-28T01:00:00+00:00' };
  const reloaded = matrixResults({ weights: saved.weights, scores: saved.scores });
  assert.equal(reloaded[0].id, 'gravity-thickener');
  assert.equal(reloaded.find((tech) => tech.id === 'solar-drying').score, solar.score);

  const single = structuredClone(sample.technology);
  single.scores['gravity-thickener'].feasibility = 5;
  const singleResult = matrixResults(single);
  assert.equal(singleResult.find((tech) => tech.id === 'gravity-thickener').scores.feasibility, 5);
  assert.notEqual(
    singleResult.find((tech) => tech.id === 'gravity-thickener').score,
    before.find((tech) => tech.id === 'gravity-thickener').score,
  );

  const multi = structuredClone(sample.technology);
  multi.scores['centrifuge'].capex = 5;
  multi.scores['centrifuge'].opex = 5;
  const multiResult = matrixResults(multi);
  assert.equal(multiResult.find((tech) => tech.id === 'centrifuge').scores.capex, 5);
  assert.equal(multiResult.find((tech) => tech.id === 'centrifuge').scores.opex, 5);
});

test('invalid weights and scores are clamped safely', () => {
  assert.equal(sanitizeWeight(-1), 0);
  assert.equal(sanitizeWeight(2000), 1000);
  assert.equal(sanitizeWeight(Number.NaN), 0);
  assert.equal(sanitizeWeight('18'), 18);
  assert.equal(sanitizeScore(0), 1);
  assert.equal(sanitizeScore(6), 5);
  assert.equal(sanitizeScore(Number.NaN), 1);
  assert.equal(sanitizeScore('3'), 3);
});

test('generation projection uses latest saved record and handles missing data', () => {
  const older = { id: 1, date: '2026-11-20', wet_sludge_kg: 1000, moisture_pct: 90, wastewater_m3: 500, operating_days: 20 };
  const newer = { id: 2, date: '2026-11-27', wet_sludge_kg: 2000, moisture_pct: 90, wastewater_m3: 1000, operating_days: 25 };
  assert.equal(annualWetTonnesFromGeneration([older, newer]), generationMetrics(newer).annual / 1000);
  assert.equal(annualWetTonnesFromGeneration([]), 0);

  const sameDate = { ...newer, id: 3, wet_sludge_kg: 4000 };
  assert.equal(annualWetTonnesFromGeneration([newer, sameDate]), generationMetrics(sameDate).annual / 1000);
});

test('reference table maps each technology to its indicative cost and resource figures', () => {
  const expected = {
    'gravity-thickener': ['Thickening', 90, 12, 4, 0.2, 220],
    daf: ['Thickening', 140, 22, 18, 1.5, 120],
    'mechanical-thickener': ['Thickening', 180, 28, 26, 1, 90],
    'filter-press': ['Dewatering', 260, 42, 32, 2.5, 150],
    'belt-filter-press': ['Dewatering', 220, 38, 28, 2, 180],
    centrifuge: ['Dewatering', 520, 76, 85, 3, 70],
    'screw-press': ['Dewatering', 240, 34, 22, 1.2, 110],
    'solar-drying': ['Drying', 120, 10, 2, 0, 900],
    'thermal-drying': ['Drying', 650, 130, 180, 0.5, 140],
    'waste-heat-drying': ['Drying', 300, 24, 12, 0, 260],
  };
  for (const tech of TECHNOLOGIES) {
    const values = expected[tech.id];
    assert.ok(values, `${tech.id} missing reference expectation`);
    assert.deepEqual(
      [tech.group, tech.capexLakh, tech.opexLakhYear, tech.energyKwhTon, tech.chemicalKgTon, tech.spaceM2],
      values,
    );
    assert.equal(num(tech.spaceM2, 0), tech.spaceM2.toLocaleString('en-IN'));
  }

  const annualWetTonnes = 500;
  const solar = TECHNOLOGIES.find((tech) => tech.id === 'solar-drying');
  close(solar.capexLakh + solar.opexLakhYear * 5, 120 + 10 * 5);
  close(annualWetTonnes * solar.energyKwhTon, 1000);
  close(annualWetTonnes * solar.chemicalKgTon, 0);
});

test('page keeps units, search fields, normalization and illustrative-data disclaimer', () => {
  for (const text of [
    'NORMALISE TO 100', 'SAVE MATRIX →', '1 = LOW · 5 = HIGH',
    'CAPEX ₹ LAKH', 'OPEX ₹ LAKH/YR', '5-YR ₹ LAKH',
    'ENERGY KWH/YR', 'CHEMICAL KG/YR', 'SPACE m²',
    'fiveYear: tech.capexLakh + tech.opexLakhYear * 5',
    'annualEnergy: annualWetTonnes * tech.energyKwhTon',
    'annualChemical: annualWetTonnes * tech.chemicalKgTon',
    "searchFields={['name', 'group']}",
    'winner.capexLakh', 'winner.opexLakhYear',
    'not quotations or verified site data',
  ]) {
    assert.ok(pageSource.includes(text), `missing UI text: ${text}`);
  }
  assert.ok(uiSource.includes('setQuery(event.target.value)'));
  assert.ok(uiSource.includes('const toggleSort = (key)'));
});
