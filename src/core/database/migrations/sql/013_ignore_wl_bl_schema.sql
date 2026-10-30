-- Add mode column to ignored_entities for Whitelist (wl) / Blacklist (bl) support
ALTER TABLE ignored_entities ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'bl' CHECK (mode IN ('wl', 'bl'));
