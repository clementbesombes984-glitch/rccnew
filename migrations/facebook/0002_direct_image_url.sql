-- Additive migration: safe for databases which already applied 0001.
-- image_key is a legacy unused column, retained to preserve existing records.
ALTER TABLE facebook_posts ADD COLUMN image_url TEXT NOT NULL DEFAULT '';
