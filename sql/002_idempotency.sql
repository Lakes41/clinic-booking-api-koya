-- LEVEL 4 MIGRATION: Run once in the Neon SQL Editor before starting Level 4.
-- A completed response is committed atomically with its booking.
-- The primary key serialises concurrent requests using the same key.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  status_code INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT completed_response_pair CHECK (
    (status_code IS NULL AND response_body IS NULL)
    OR (status_code IS NOT NULL AND response_body IS NOT NULL)
  )
);
