-- Preserve paid rentals and ACLs when an empty room is parked and recreated.
ALTER TABLE pvc_sessions ADD COLUMN IF NOT EXISTS room_name TEXT;
ALTER TABLE pvc_sessions ADD COLUMN IF NOT EXISTS bitrate INTEGER;
ALTER TABLE pvc_access DROP CONSTRAINT IF EXISTS pvc_access_channel_id_fkey;
ALTER TABLE pvc_access ADD CONSTRAINT pvc_access_channel_id_fkey
  FOREIGN KEY (channel_id) REFERENCES pvc_sessions(channel_id)
  ON UPDATE CASCADE ON DELETE CASCADE;
