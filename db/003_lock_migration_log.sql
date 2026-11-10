-- The list of applied migrations is for the server only. On Supabase, tables created later
-- in the public schema are granted to the public API roles by default, so take that back.
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON schema_migrations FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON schema_migrations FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON schema_migrations FROM authenticated;
  END IF;
END $$;
