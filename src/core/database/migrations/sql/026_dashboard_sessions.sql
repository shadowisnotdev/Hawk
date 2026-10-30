-- 026_dashboard_sessions.sql: Server-Side Dashboard Sessions & OTP Store
CREATE TABLE IF NOT EXISTS dashboard_sessions (
  token VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(32) NOT NULL,
  username VARCHAR(64) NOT NULL,
  discriminator VARCHAR(8) NOT NULL DEFAULT '0',
  avatar TEXT,
  is_bot_owner BOOLEAN NOT NULL DEFAULT FALSE,
  is_bot_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dashboard_sessions_token ON dashboard_sessions(token);
CREATE INDEX IF NOT EXISTS idx_dashboard_sessions_expires_at ON dashboard_sessions(expires_at);

CREATE TABLE IF NOT EXISTS dashboard_otps (
  user_id VARCHAR(32) PRIMARY KEY,
  otp_code VARCHAR(8) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  locked_until TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dashboard_otps_user_id ON dashboard_otps(user_id);
