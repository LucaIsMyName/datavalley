ALTER TABLE public_forms ADD COLUMN daily_limit integer NOT NULL DEFAULT 200;
ALTER TABLE public_forms ADD COLUMN window_started_at timestamptz;
ALTER TABLE public_forms ADD COLUMN window_count integer NOT NULL DEFAULT 0;
