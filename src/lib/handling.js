export const HANDLING_PROCESS_ORDER = Object.freeze(['Thickening', 'Dewatering', 'Drying']);

export function handlingProcessRank(processGroup) {
  const index = HANDLING_PROCESS_ORDER.indexOf(processGroup);
  return index === -1 ? HANDLING_PROCESS_ORDER.length : index;
}

export function orderHandlingRuns(records) {
  const rows = Array.isArray(records) ? records : [];
  return [...rows].sort((a, b) => {
    const byStage = handlingProcessRank(a.process_group) - handlingProcessRank(b.process_group);
    if (byStage) return byStage;
    const byDate = String(b.date ?? '').localeCompare(String(a.date ?? ''));
    if (byDate) return byDate;
    return Number(b.id ?? 0) - Number(a.id ?? 0);
  });
}
