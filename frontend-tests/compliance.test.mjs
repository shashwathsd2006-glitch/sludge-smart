import test from 'node:test';
import assert from 'node:assert/strict';

import { normaliseRecords } from '../src/lib/normalise.js';
import { withinDateRange } from '../src/lib/calc.js';

test('normaliseRecords handles array response', () => {
  const rows = [{ id: 1 }, { id: 2 }];
  assert.deepEqual(normaliseRecords(rows), rows);
});

test('normaliseRecords handles paginated/object responses', () => {
  const rows = [{ id: 1 }];
  assert.deepEqual(normaliseRecords({ items: rows, total: 1 }), rows);
  assert.deepEqual(normaliseRecords({ records: rows }), rows);
  assert.deepEqual(normaliseRecords({ data: rows }), rows);
  assert.deepEqual(normaliseRecords({ consignments: rows }), rows);
});

test('normaliseRecords handles empty/null/missing safely', () => {
  assert.deepEqual(normaliseRecords([]), []);
  assert.deepEqual(normaliseRecords({ items: [] }), []);
  assert.deepEqual(normaliseRecords(null), []);
  assert.deepEqual(normaliseRecords(undefined), []);
  assert.deepEqual(normaliseRecords({}), []);
  assert.deepEqual(normaliseRecords('oops'), []);
});

test('consignment date filter logic is inclusive and safe', () => {
  const row = { date: '2026-11-15' };
  assert.equal(withinDateRange(row, '2026-11-01', '2026-11-30'), true);
  assert.equal(withinDateRange(row, '2026-11-16', '2026-11-30'), false);
  assert.equal(withinDateRange({}, '2026-11-01', '2026-11-30'), false);
});
