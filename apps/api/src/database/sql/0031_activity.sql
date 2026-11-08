ALTER TABLE tables ADD COLUMN activity boolean NOT NULL DEFAULT false;

UPDATE tables SET activity = true WHERE lower(btrim(name)) IN ('tasks', 'meetings');
