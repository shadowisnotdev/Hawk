-- ============================================================
-- 040_purge_dashboard_fully.sql
-- Permanently drop all remaining dashboard tables, sessions, and policies
-- ============================================================

DROP TABLE IF EXISTS dashboard_sessions CASCADE;
DROP TABLE IF EXISTS dashboard_access_policy CASCADE;
DROP TABLE IF EXISTS dashboard_otps CASCADE;
DROP TABLE IF EXISTS dashboard_access CASCADE;
DROP TABLE IF EXISTS role_policies CASCADE;
DROP TABLE IF EXISTS user_overrides CASCADE;
DROP TABLE IF EXISTS custom_profiles CASCADE;
DROP TABLE IF EXISTS guild_audit_logs CASCADE;

