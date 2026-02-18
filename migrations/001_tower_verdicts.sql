CREATE TABLE IF NOT EXISTS tower_verdicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  artefact_id text,
  artefact_type text NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('ACCEPT', 'CHANGE_PLAN', 'STOP')),
  stop_reason jsonb,
  delivered integer,
  requested integer,
  gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence integer,
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tower_verdicts_run_id ON tower_verdicts(run_id);
CREATE INDEX IF NOT EXISTS idx_tower_verdicts_created_at ON tower_verdicts(created_at DESC);
