ALTER TABLE login_attempts
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'password';

ALTER TABLE login_attempts
  DROP CONSTRAINT IF EXISTS login_attempts_phase_check;

ALTER TABLE login_attempts
  ADD CONSTRAINT login_attempts_phase_check CHECK (phase IN ('password', 'totp'));
