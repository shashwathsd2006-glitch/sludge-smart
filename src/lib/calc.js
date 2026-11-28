import { CRITERIA, TECHNOLOGIES } from '../data/technologies.js';

export const num = (value, digits = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  return parsed.toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

export const int = (value) => num(value, 0);

export const shortDate = (value) => {
  if (!value) return '—';
  const [y, m, d] = value.split('-');
  if (!y || !m || !d) return value;
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${d} ${months[Number(m) - 1]} ${y.slice(2)}`;
};

export const withinDateRange = (row, from, to) => {
  const value = String(row.date || '');
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
};

// Module 02 core calculations ------------------------------------------------
export const drySolids = (wetKg, moisturePct) => wetKg * (100 - moisturePct) / 100;
export const generationRate = (dryKg, wastewaterM3) => wastewaterM3 > 0 ? dryKg / wastewaterM3 : 0;

export function generationMetrics(record) {
  const dry = drySolids(record.wet_sludge_kg, record.moisture_pct);
  return {
    wet: record.wet_sludge_kg,
    dry,
    rate: generationRate(dry, record.wastewater_m3),
    monthly: record.wet_sludge_kg * record.operating_days,
    monthlyDry: dry * record.operating_days,
    annual: record.wet_sludge_kg * record.operating_days * 12,
    annualDry: dry * record.operating_days * 12,
  };
}

// Module 04 core calculations ------------------------------------------------
// Dry solids are assumed to be fully retained during thickening/dewatering/
// drying. Only water is removed. This is an engineering estimate, not a
// measured solids recovery — solids losses in filtrate/decanter are not modelled.
export function handlingMetrics(run) {
  const dryRetained = drySolids(run.initial_mass_kg, run.initial_moisture_pct);
  const dryFractionFinal = (100 - run.final_moisture_pct) / 100;
  const finalMass = dryFractionFinal > 0 ? dryRetained / dryFractionFinal : 0;
  const reduction = run.initial_mass_kg > 0
    ? (run.initial_mass_kg - finalMass) / run.initial_mass_kg * 100
    : 0;
  return { dryRetained, finalMass, reduction, waterRemoved: run.initial_mass_kg - finalMass };
}

// Module 03 illustrative data-quality screening bands ------------------------
// These are NOT regulatory limits or laboratory acceptance criteria. They only
// flag unusual entries for human review.
export const SCREENING_BANDS = {
  ph: { min: 6.5, max: 8.5, unit: '' },
  moisture_pct: { min: 0, max: 96, unit: '%' },
  total_solids_pct: { min: 3, max: 100, unit: '%' },
  volatile_solids_pct: { min: 0, max: 70, unit: '%' },
  oil_grease_mgkg: { min: 0, max: 500, unit: 'mg/kg' },
  cod_mgl: { min: 0, max: 3000, unit: 'mg/L' },
  lead_mgkg: { min: 0, max: 5, unit: 'mg/kg' },
  chromium_mgkg: { min: 0, max: 3, unit: 'mg/kg' },
  cadmium_mgkg: { min: 0, max: 1, unit: 'mg/kg' },
  nickel_mgkg: { min: 0, max: 5, unit: 'mg/kg' },
};

export const PARAMETERS = [
  { key: 'ph', label: 'pH', unit: '' },
  { key: 'moisture_pct', label: 'Moisture content', unit: '%' },
  { key: 'total_solids_pct', label: 'Total solids', unit: '%' },
  { key: 'volatile_solids_pct', label: 'Volatile solids', unit: '%' },
  { key: 'oil_grease_mgkg', label: 'Oil and grease', unit: 'mg/kg' },
  { key: 'cod_mgl', label: 'COD (where relevant)', unit: 'mg/L' },
  { key: 'lead_mgkg', label: 'Lead', unit: 'mg/kg' },
  { key: 'chromium_mgkg', label: 'Chromium', unit: 'mg/kg' },
  { key: 'cadmium_mgkg', label: 'Cadmium', unit: 'mg/kg' },
  { key: 'nickel_mgkg', label: 'Nickel', unit: 'mg/kg' },
];

export function screeningFlags(record) {
  return PARAMETERS.filter(({ key }) => {
    const value = record[key];
    const band = SCREENING_BANDS[key];
    return value !== null && value !== undefined && value !== '' &&
      (Number(value) < band.min || Number(value) > band.max);
  }).map(({ key }) => key);
}

export function missingParameters(record) {
  return PARAMETERS.filter(({ key }) => {
    const value = record[key];
    return value === null || value === undefined || value === '';
  }).map(({ key }) => key);
}

// Module 05 weighted decision matrix ----------------------------------------
export function matrixResults(settings) {
  const weights = settings?.weights || {};
  const scores = settings?.scores || {};
  const totalWeight = CRITERIA.reduce((sum, c) => sum + (Number(weights[c.key]) || 0), 0);
  const catalogueOrder = new Map(TECHNOLOGIES.map((tech, index) => [tech.id, index]));

  return TECHNOLOGIES.map((tech) => {
    const techScores = scores[tech.id] || {};
    const weighted = CRITERIA.reduce((sum, c) => {
      const weight = Number(weights[c.key]) || 0;
      const score = Number(techScores[c.key]) || 0;
      return sum + weight * score;
    }, 0);
    return {
      ...tech,
      scores: techScores,
      weighted,
      score: totalWeight > 0 ? weighted / totalWeight : 0,
    };
  }).sort((a, b) => b.score - a.score || catalogueOrder.get(a.id) - catalogueOrder.get(b.id));
}

export function normalizeWeights(weights) {
  const values = CRITERIA.map((criterion) => {
    const value = Number(weights?.[criterion.key]);
    return { key: criterion.key, value: Number.isFinite(value) && value > 0 ? value : 0 };
  });
  const total = values.reduce((sum, item) => sum + item.value, 0);

  if (total <= 0) {
    const normalized = values.map((item) => ({ ...item, value: Math.floor(100 / CRITERIA.length) }));
    normalized[0].value += 100 - normalized.reduce((sum, item) => sum + item.value, 0);
    return Object.fromEntries(normalized.map((item) => [item.key, item.value]));
  }

  const rounded = values.map((item) => ({ ...item, value: Math.round(item.value / total * 100) }));
  const drift = 100 - rounded.reduce((sum, item) => sum + item.value, 0);
  const max = rounded.reduce((best, item) => item.value > best.value ? item : best, rounded[0]);
  max.value += drift;
  return Object.fromEntries(rounded.map((item) => [item.key, item.value]));
}
