-- Notifications contain only guild IDs and event names; subscribers re-read authorized data.
CREATE OR REPLACE FUNCTION notify_dashboard_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  guild TEXT;
  event_name TEXT;
BEGIN
  guild := COALESCE(NEW.guild_id, OLD.guild_id);
  event_name := CASE TG_TABLE_NAME
    WHEN 'activity_log' THEN 'activity:new'
    WHEN 'command_telemetry' THEN 'activity:new'
    WHEN 'economy_audit_log' THEN 'economy:transaction'
    WHEN 'economy_transactions' THEN 'economy:transaction'
    WHEN 'pvc_sessions' THEN 'pvc:update'
    ELSE 'config:changed'
  END;
  PERFORM pg_notify('dashboard_events', json_build_object('guildId', guild, 'event', event_name)::text);
  RETURN COALESCE(NEW, OLD);
END;
$$;
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['guild_config','economy_config','welcome_configs','suggestion_configs','confession_configs','income_roles','store_items','sticky_messages','game_pings','game_guild_configs','game_cooldowns','activity_log','command_telemetry','economy_audit_log','economy_transactions','pvc_sessions','permits','role_policies','user_overrides','custom_profiles'] LOOP
    IF to_regclass(table_name) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS dashboard_change ON %I', table_name);
      EXECUTE format('CREATE TRIGGER dashboard_change AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION notify_dashboard_change()', table_name);
    END IF;
  END LOOP;
END;
$$;
