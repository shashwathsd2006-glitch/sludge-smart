import test from 'node:test';
import assert from 'node:assert/strict';
import { HANDLING_PROCESS_ORDER, handlingProcessRank, orderHandlingRuns } from '../src/lib/handling.js';

const run = (id, process_group, date) => ({ id, process_group, date });

test('process order is thickening, dewatering then drying', () => {
  assert.deepEqual(HANDLING_PROCESS_ORDER, ['Thickening', 'Dewatering', 'Drying']);
  assert.ok(handlingProcessRank('Thickening') < handlingProcessRank('Dewatering'));
  assert.ok(handlingProcessRank('Dewatering') < handlingProcessRank('Drying'));
  assert.equal(handlingProcessRank('Unknown'), HANDLING_PROCESS_ORDER.length);
});

test('saved runs are grouped by stage then newest date first', () => {
  const records = [
    run(8, 'Drying', '2026-11-12'),
    run(3, 'Thickening', '2026-10-21'),
    run(6, 'Dewatering', '2026-11-01'),
    run(2, 'Thickening', '2026-10-18'),
    run(7, 'Drying', '2026-11-05'),
    run(5, 'Dewatering', '2026-10-29'),
    run(1, 'Thickening', '2026-10-14'),
    run(4, 'Dewatering', '2026-10-21'),
  ];
  const original = records.map((item) => item.id);
  const ordered = orderHandlingRuns(records).map((item) => item.id);
  assert.deepEqual(ordered, [3, 2, 1, 6, 5, 4, 8, 7]);
  assert.deepEqual(records.map((item) => item.id), original);
});

test('same-date runs use a stable id-descending secondary order', () => {
  const records = [
    run(10, 'Thickening', '2026-11-01'),
    run(14, 'Drying', '2026-11-01'),
    run(12, 'Thickening', '2026-11-01'),
    run(13, 'Dewatering', '2026-11-01'),
    run(11, 'Thickening', '2026-11-01'),
  ];
  assert.deepEqual(orderHandlingRuns(records).map((item) => item.id), [12, 11, 10, 13, 14]);
});

test('unknown process groups remain after the three defined stages', () => {
  const records = [
    run(20, 'Unknown', '2026-12-01'),
    run(21, 'Drying', '2026-10-01'),
    run(22, 'Thickening', '2026-10-01'),
  ];
  assert.deepEqual(orderHandlingRuns(records).map((item) => item.id), [22, 21, 20]);
});
