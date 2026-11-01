ALTER TABLE user_table_state
  ADD COLUMN display jsonb NOT NULL DEFAULT '{}'::jsonb;
