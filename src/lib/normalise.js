export function normaliseRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    for (const key of ['items', 'records', 'rows', 'data', 'results', 'consignments', 'disposals']) {
      if (Array.isArray(payload[key])) return payload[key];
    }
  }
  return [];
}
