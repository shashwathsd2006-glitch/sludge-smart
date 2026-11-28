import test from 'node:test';
import assert from 'node:assert/strict';
import { generationMetrics } from '../src/lib/calc.js';
import {
  blankGenerationForm,
  generationFormFromRecord,
  generationFormMetrics,
  latestGenerationRecord,
  updateGenerationField,
  validateGenerationForm,
} from '../src/lib/generation.js';

const close = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} is not within ${tolerance} of ${expected}`);
};

const applyFields = (form, values) => Object.entries(values)
  .reduce((current, [key, value]) => updateGenerationField(current, key, value), form);

const validValues = {
  wastewater_m3: '420',
  wet_sludge_kg: '1120',
  moisture_pct: '94.2',
};

test('blank generation form starts empty except for 26 operating days', () => {
  const form = blankGenerationForm('2026-11-27');
  assert.equal(form.date, '2026-11-27');
  assert.equal(form.wastewater_m3, '');
  assert.equal(form.wet_sludge_kg, '');
  assert.equal(form.moisture_pct, '');
  assert.equal(form.operating_days, '26');
  assert.equal(generationFormMetrics(form), null);
});

test('live preview recalculates after each generation field change', () => {
  let form = blankGenerationForm('2026-11-27');
  form = updateGenerationField(form, 'wastewater_m3', '420');
  assert.equal(generationFormMetrics(form), null);

  form = updateGenerationField(form, 'wet_sludge_kg', '1120');
  assert.equal(generationFormMetrics(form), null);

  form = updateGenerationField(form, 'moisture_pct', '94.2');
  const initial = generationFormMetrics(form);
  assert.ok(initial);
  close(initial.dry, 64.96);
  close(initial.rate, 64.96 / 420);
  close(initial.monthly, 1120 * 26);
  close(initial.annual, 1120 * 26 * 12);

  form = updateGenerationField(form, 'moisture_pct', '90');
  const drier = generationFormMetrics(form);
  close(drier.dry, 112);
  close(drier.rate, 112 / 420);

  form = updateGenerationField(form, 'wastewater_m3', '560');
  close(generationFormMetrics(form).rate, 112 / 560);

  form = updateGenerationField(form, 'operating_days', '30');
  const projected = generationFormMetrics(form);
  close(projected.monthly, 1120 * 30);
  close(projected.annual, 1120 * 30 * 12);
});

test('updateGenerationField is immutable, preserves other fields and ignores unknown keys', () => {
  const form = blankGenerationForm('2026-11-27');
  const next = updateGenerationField(form, 'wastewater_m3', '420');
  assert.notEqual(next, form);
  assert.equal(next.wastewater_m3, '420');
  assert.equal(form.wastewater_m3, '');
  assert.equal(updateGenerationField(next, 'wastewater_m3', '420'), next);
  assert.equal(updateGenerationField(next, 'unknown', 'x'), next);
});

test('validation rejects empty, zero, negative and invalid generation inputs', () => {
  const valid = applyFields(blankGenerationForm('2026-11-27'), validValues);
  assert.deepEqual(validateGenerationForm(valid), {});

  const invalidCases = [
    ['date', '', 'date'],
    ['date', '27-11-2026', 'date'],
    ['wastewater_m3', '', 'wastewater_m3'],
    ['wastewater_m3', '0', 'wastewater_m3'],
    ['wastewater_m3', '-1', 'wastewater_m3'],
    ['wastewater_m3', 'abc', 'wastewater_m3'],
    ['wet_sludge_kg', '', 'wet_sludge_kg'],
    ['wet_sludge_kg', '0', 'wet_sludge_kg'],
    ['wet_sludge_kg', '-5', 'wet_sludge_kg'],
    ['moisture_pct', '', 'moisture_pct'],
    ['moisture_pct', '-1', 'moisture_pct'],
    ['moisture_pct', '100', 'moisture_pct'],
    ['moisture_pct', 'NaN', 'moisture_pct'],
    ['operating_days', '', 'operating_days'],
    ['operating_days', '0', 'operating_days'],
    ['operating_days', '-1', 'operating_days'],
    ['operating_days', '32', 'operating_days'],
  ];

  for (const [key, value, expectedError] of invalidCases) {
    const invalid = applyFields(valid, { [key]: value });
    assert.ok(validateGenerationForm(invalid)[expectedError], `${key}=${value} should be invalid`);
    assert.equal(generationFormMetrics(invalid), null);
  }
});

test('saved record projection uses persisted operating days and raw inputs', () => {
  const record = {
    id: 7,
    date: '2026-11-27',
    wastewater_m3: 420,
    wet_sludge_kg: 1120,
    moisture_pct: 90,
    operating_days: 28,
  };
  const metrics = generationMetrics(record);
  close(metrics.dry, 112);
  close(metrics.rate, 112 / 420);
  close(metrics.monthly, 1120 * 28);
  close(metrics.annualDry, 112 * 28 * 12);

  const form = generationFormFromRecord(record);
  assert.equal(form.operating_days, '28');
  close(generationFormMetrics(form).monthly, metrics.monthly);
});

test('production summary selects the latest saved record by date then id', () => {
  const records = [
    { id: 4, date: '2026-11-27', wastewater_m3: 560, wet_sludge_kg: 1000, moisture_pct: 90, operating_days: 30 },
    { id: 5, date: '2026-11-20', wastewater_m3: 420, wet_sludge_kg: 1120, moisture_pct: 94, operating_days: 26 },
    { id: 6, date: '2026-11-27', wastewater_m3: 700, wet_sludge_kg: 1400, moisture_pct: 92, operating_days: 25 },
  ];
  const latest = latestGenerationRecord(records);
  assert.equal(latest.id, 6);
  close(generationMetrics(latest).dry, 112);
  assert.equal(latestGenerationRecord([]), null);
});
