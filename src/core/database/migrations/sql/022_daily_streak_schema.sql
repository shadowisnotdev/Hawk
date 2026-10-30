-- Migration 022: Daily Streak System & Config
ALTER TABLE economy_balances
  ADD COLUMN IF NOT EXISTS daily_last TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS daily_streak INT NOT NULL DEFAULT 0;

ALTER TABLE economy_config
  ADD COLUMN IF NOT EXISTS daily_reward_amount BIGINT NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS daily_streak_bonus BIGINT NOT NULL DEFAULT 100;