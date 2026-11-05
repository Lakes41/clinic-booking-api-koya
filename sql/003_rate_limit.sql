-- LEVEL 5 MIGRATION. Run after 001_init.sql and 002_idempotency.sql.
-- Store booking attempts across instances and restarts.
CREATE TABLE IF NOT EXISTS booking_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS booking_attempts_email_time_idx
  ON booking_attempts(email, attempted_at);

-- Preserve Retry-After for a replay of an idempotent 429 response.
ALTER TABLE idempotency_keys
  ADD COLUMN IF NOT EXISTS retry_after_seconds INTEGER;
