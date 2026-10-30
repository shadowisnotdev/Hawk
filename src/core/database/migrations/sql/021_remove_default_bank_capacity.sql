-- Migration 021: Remove default bank capacity (set to 0 for unlimited)
ALTER TABLE economy_balances ALTER COLUMN bank_capacity SET DEFAULT 0;

-- Reset existing default 10000 capacity records to 0 (unlimited)
UPDATE economy_balances SET bank_capacity = 0 WHERE bank_capacity = 10000;