import { generationMetrics } from './calc.js';
import { latestGenerationRecord } from './generation.js';

export function sanitizeWeight(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(1000, Math.max(0, parsed));
}

export function sanitizeScore(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(5, Math.max(1, Math.round(parsed)));
}

export function annualWetTonnesFromGeneration(records) {
  const latest = latestGenerationRecord(records);
  return latest ? generationMetrics(latest).annual / 1000 : 0;
}
