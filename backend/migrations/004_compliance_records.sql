ALTER TABLE compliance_items ADD COLUMN created_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00+00:00';
-- @@
ALTER TABLE compliance_items ADD COLUMN updated_by TEXT NOT NULL DEFAULT '';
-- @@
ALTER TABLE compliance_items ADD COLUMN source TEXT NOT NULL DEFAULT 'user';
-- @@
ALTER TABLE disposal_records ADD COLUMN updated_by TEXT NOT NULL DEFAULT '';
