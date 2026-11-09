-- Fractional-index keys (for example "Zz" < "a0" < "a0V" < "a0l") are only ordered correctly byte by byte.
-- Linguistic collations such as en_US.UTF-8 sort them case-insensitively, which reorders rows and makes
-- generateKeyBetween reject neighbours. Indexes on these columns are rebuilt by the type change.
ALTER TABLE table_rows ALTER COLUMN position TYPE text COLLATE "C";
ALTER TABLE table_columns ALTER COLUMN position TYPE text COLLATE "C";
ALTER TABLE column_options ALTER COLUMN position TYPE text COLLATE "C";
ALTER TABLE table_statuses ALTER COLUMN position TYPE text COLLATE "C";
ALTER TABLE tables ALTER COLUMN position TYPE text COLLATE "C";
