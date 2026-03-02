ALTER TABLE tower_verdicts
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tower_verdicts_idempotency_key
  ON tower_verdicts (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE judgement_evaluations
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_judgement_evaluations_idempotency_key
  ON judgement_evaluations (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
