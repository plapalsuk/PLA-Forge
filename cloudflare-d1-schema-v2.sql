-- PLA Forge schema migration v2 — employee authentication and roles

ALTER TABLE users ADD COLUMN password_salt TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN last_login_at TEXT;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);

INSERT OR REPLACE INTO schema_meta (key, value, updated_at)
VALUES ('schema_version', '2', CURRENT_TIMESTAMP);
