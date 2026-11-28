import { generationMetrics } from './calc.js';

export const GENERATION_FORM_KEYS = Object.freeze([
  'date',
  'wastewater_m3',
  'wet_sludge_kg',
  'moisture_pct',
  'operating_days',
]);

const isEmpty = (value) => value === null || value === undefined || String(value).trim() === '';
const parsed = (value) => Number(String(value).trim());
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const asText = (value) => value === null || value === undefined ? '' : String(value);

export function blankGenerationForm(date = new Date().toISOString().slice(0, 10)) {
  return {
    date,
    wastewater_m3: '',
    wet_sludge_kg: '',
    moisture_pct: '',
    operating_days: '26',
  };
}

export function generationFormFromRecord(record) {
  return {
    date: asText(record.date),
    wastewater_m3: asText(record.wastewater_m3),
    wet_sludge_kg: asText(record.wet_sludge_kg),
    moisture_pct: asText(record.moisture_pct),
    operating_days: asText(record.operating_days),
  };
}

export function updateGenerationField(form, key, value) {
  if (!GENERATION_FORM_KEYS.includes(key)) return form;
  const next = asText(value);
  return form[key] === next ? form : { ...form, [key]: next };
}

export function validateGenerationForm(form) {
  const errors = {};
  if (!validDate(form.date)) errors.date = 'Date is required.';

  const wastewater = parsed(form.wastewater_m3);
  const wet = parsed(form.wet_sludge_kg);
  const moisture = parsed(form.moisture_pct);
  const days = parsed(form.operating_days);

  if (isEmpty(form.wastewater_m3) || !Number.isFinite(wastewater) || wastewater <= 0 || wastewater > 1_000_000) {
    errors.wastewater_m3 = 'Enter a value greater than 0.';
  }
  if (isEmpty(form.wet_sludge_kg) || !Number.isFinite(wet) || wet <= 0 || wet > 10_000_000) {
    errors.wet_sludge_kg = 'Enter a value greater than 0.';
  }
  if (isEmpty(form.moisture_pct) || !Number.isFinite(moisture) || moisture < 0 || moisture >= 100) {
    errors.moisture_pct = 'Use a value from 0 to below 100.';
  }
  if (isEmpty(form.operating_days) || !Number.isFinite(days) || days <= 0 || days > 31) {
    errors.operating_days = 'Use 1–31 operating days.';
  }
  return errors;
}

export function generationFormMetrics(form) {
  if (Object.keys(validateGenerationForm(form)).length) return null;
  return generationMetrics({
    wastewater_m3: parsed(form.wastewater_m3),
    wet_sludge_kg: parsed(form.wet_sludge_kg),
    moisture_pct: parsed(form.moisture_pct),
    operating_days: parsed(form.operating_days),
  });
}

export function latestGenerationRecord(records) {
  const rows = Array.isArray(records) ? records : [];
  return [...rows].sort((a, b) => {
    const byDate = String(b.date ?? '').localeCompare(String(a.date ?? ''));
    if (byDate) return byDate;
    return Number(b.id ?? 0) - Number(a.id ?? 0);
  })[0] ?? null;
}
