-- PLA Forge v0.9.9 — Cloud Production / Build Plates
CREATE TABLE IF NOT EXISTS forge_operational_state (
  state_key TEXT PRIMARY KEY,
  json_value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS build_plates (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT,
  colour TEXT,
  printer TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  items_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_build_plates_status ON build_plates(status);
CREATE INDEX IF NOT EXISTS idx_build_plates_created_at ON build_plates(created_at);

INSERT OR IGNORE INTO schema_meta(key,value) VALUES('production_cloud_version','0.9.9');
UPDATE schema_meta SET value='0.9.9' WHERE key='production_cloud_version';
