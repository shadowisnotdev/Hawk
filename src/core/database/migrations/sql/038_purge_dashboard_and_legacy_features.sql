-- ============================================================
-- 038_purge_dashboard_and_legacy_features.sql
-- Cleanly drop all tables, triggers, and objects associated with:
-- 1. Web Dashboard (sessions, otps, access, policies, notifications)
-- 2. Economy & Income (balances, config, roles, transactions, audit)
-- 3. Store & Inventory (store_items, user_inventory)
-- 4. Private Voice Channels / PVC (sessions, access, defaults)
-- 5. Games (game_cooldowns)
-- 6. Confession (confession_configs)
-- ============================================================

-- 1. Drop Dashboard Triggers and Notification Function
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS dashboard_change ON %I', t);
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS notify_dashboard_change() CASCADE;

-- 2. Drop Dashboard Tables
DROP TABLE IF EXISTS dashboard_otps CASCADE;
DROP TABLE IF EXISTS dashboard_sessions CASCADE;
DROP TABLE IF EXISTS dashboard_access CASCADE;
DROP TABLE IF EXISTS role_policies CASCADE;
DROP TABLE IF EXISTS user_overrides CASCADE;
DROP TABLE IF EXISTS custom_profiles CASCADE;
DROP TABLE IF EXISTS guild_audit_logs CASCADE;

-- 3. Drop Economy & Income Tables
DROP TABLE IF EXISTS economy_transactions CASCADE;
DROP TABLE IF EXISTS economy_audit_log CASCADE;
DROP TABLE IF EXISTS economy_balances CASCADE;
DROP TABLE IF EXISTS income_roles CASCADE;
DROP TABLE IF EXISTS economy_config CASCADE;

-- 4. Drop Store & Inventory Tables
DROP TABLE IF EXISTS user_inventory CASCADE;
DROP TABLE IF EXISTS store_items CASCADE;

-- 5. Drop PVC Tables
DROP TABLE IF EXISTS pvc_access CASCADE;
DROP TABLE IF EXISTS pvc_sessions CASCADE;
DROP TABLE IF EXISTS pvc_user_defaults CASCADE;
DROP TABLE IF EXISTS pvc_defaults CASCADE;

-- 6. Drop Games Cooldowns Table
DROP TABLE IF EXISTS game_cooldowns CASCADE;

-- 7. Drop Confession Configs Table
DROP TABLE IF EXISTS confession_configs CASCADE;

