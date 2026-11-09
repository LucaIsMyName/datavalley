-- A quote is a table setting that names the columns of the document, not a guess from column names.
ALTER TABLE tables ADD COLUMN document_config jsonb NOT NULL DEFAULT '{}'::jsonb;
