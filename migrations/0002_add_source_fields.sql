-- Add source metadata for OpenClaw / automated news ingestion.

ALTER TABLE articles ADD COLUMN source_url TEXT;
ALTER TABLE articles ADD COLUMN source_type TEXT;
