CREATE INDEX IF NOT EXISTS idx_generation_records_date_source ON generation_records(date, source);
-- @@
CREATE INDEX IF NOT EXISTS idx_lab_records_date ON lab_records(date);
-- @@
CREATE INDEX IF NOT EXISTS idx_handling_runs_date ON handling_runs(date);
-- @@
CREATE INDEX IF NOT EXISTS idx_disposal_records_date ON disposal_records(date);
-- @@
CREATE INDEX IF NOT EXISTS idx_compliance_items_status ON compliance_items(status);
