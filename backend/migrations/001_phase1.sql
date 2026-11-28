-- Phase 1 additive migration.
-- Statements are separated by the marker below and executed in one transaction.
-- No existing table or row is altered or removed.

-- @@
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 1,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- @@
CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT ''
);
-- @@
CREATE TABLE IF NOT EXISTS permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT ''
);
-- @@
CREATE TABLE IF NOT EXISTS user_roles (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);
-- @@
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);
-- @@
CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    last_seen_at TEXT
);
-- @@
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_username TEXT NOT NULL,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    record_id TEXT,
    before_values TEXT,
    after_values TEXT,
    changed_fields TEXT,
    outcome TEXT NOT NULL DEFAULT 'success',
    detail TEXT NOT NULL DEFAULT '',
    ip_address TEXT,
    user_agent TEXT,
    request_id TEXT
);
-- @@
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
-- @@
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
-- @@
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
-- @@
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_record ON audit_logs(resource, record_id);
-- @@
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id);
-- @@
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
-- @@
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);
-- @@
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions(permission_id);
-- @@
CREATE TRIGGER IF NOT EXISTS audit_logs_no_update
BEFORE UPDATE ON audit_logs
BEGIN
    SELECT RAISE(ABORT, 'audit_logs is append-only');
END;
-- @@
CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete
BEFORE DELETE ON audit_logs
BEGIN
    SELECT RAISE(ABORT, 'audit_logs is append-only');
END;
-- @@
INSERT OR IGNORE INTO roles (name, description) VALUES
    ('administrator', 'Full system access including user and permission management'),
    ('operator', 'Creates and maintains generation, handling and disposal records'),
    ('laboratory', 'Creates and maintains characterisation records'),
    ('ehs_reviewer', 'Reviews compliance, audits and reports');
-- @@
INSERT OR IGNORE INTO permissions (code, description) VALUES
    ('generation:read', 'Read sludge generation records'),
    ('generation:write', 'Create sludge generation records'),
    ('generation:delete', 'Delete sludge generation records'),
    ('lab:read', 'Read characterisation records'),
    ('lab:write', 'Create characterisation records'),
    ('lab:delete', 'Delete characterisation records'),
    ('handling:read', 'Read sludge handling runs'),
    ('handling:write', 'Create sludge handling runs'),
    ('handling:delete', 'Delete sludge handling runs'),
    ('disposal:read', 'Read disposal records'),
    ('disposal:write', 'Create disposal records'),
    ('disposal:delete', 'Delete disposal records'),
    ('compliance:read', 'Read compliance items'),
    ('compliance:write', 'Create and update compliance items'),
    ('compliance:delete', 'Delete compliance items'),
    ('technology:read', 'Read technology settings'),
    ('technology:write', 'Change technology weights and scores'),
    ('reports:read', 'Read aggregated report data'),
    ('audit:read', 'Inspect the audit log'),
    ('users:read', 'List users'),
    ('users:write', 'Create and update users');
-- @@
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'administrator';
-- @@
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'operator' AND p.code IN (
    'generation:read', 'generation:write', 'generation:delete',
    'lab:read',
    'handling:read', 'handling:write', 'handling:delete',
    'disposal:read', 'disposal:write', 'disposal:delete',
    'compliance:read', 'technology:read', 'reports:read'
);
-- @@
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'laboratory' AND p.code IN (
    'generation:read', 'lab:read', 'lab:write', 'lab:delete',
    'handling:read', 'disposal:read', 'compliance:read',
    'technology:read', 'reports:read'
);
-- @@
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'ehs_reviewer' AND p.code IN (
    'generation:read', 'lab:read', 'handling:read', 'disposal:read',
    'compliance:read', 'compliance:write', 'technology:read',
    'reports:read', 'audit:read'
);
