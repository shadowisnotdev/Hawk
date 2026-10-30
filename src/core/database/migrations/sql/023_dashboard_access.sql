-- 023_dashboard_access.sql: Private Dashboard Access Authorization Table
CREATE TABLE IF NOT EXISTS dashboard_access (
  user_id VARCHAR(32) PRIMARY KEY,
  granted_by VARCHAR(32) NOT NULL,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_dashboard_access_user_id ON dashboard_access(user_id);
