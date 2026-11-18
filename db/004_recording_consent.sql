-- Recording a chat needs a yes from the other person, given on their own phone in Wasl.
-- One row per question: who asks, who is asked, and the answer. Someone without Wasl
-- can't be asked, so they can't be recorded.
CREATE TABLE IF NOT EXISTS consents (
  id uuid PRIMARY KEY,
  asker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL,
  asker_name text NOT NULL,
  status text NOT NULL DEFAULT 'asked' CHECK (status IN ('asked','allowed','declined','ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  FOREIGN KEY (connection_id,asker_id) REFERENCES connections(id,owner_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS consents_person ON consents(person_id,created_at DESC);
CREATE INDEX IF NOT EXISTS consents_asker ON consents(asker_id,connection_id);
GRANT SELECT,INSERT,UPDATE ON consents TO wasl_member;
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
-- both people see the question; only the asker can ask; either of them can answer or end it
CREATE POLICY consent_see ON consents FOR SELECT TO wasl_member
  USING (asker_id = nullif(current_setting('app.user_id',true),'')::uuid
      OR person_id = nullif(current_setting('app.user_id',true),'')::uuid);
CREATE POLICY consent_ask ON consents FOR INSERT TO wasl_member
  WITH CHECK (asker_id = nullif(current_setting('app.user_id',true),'')::uuid
      AND status = 'asked' AND answered_at IS NULL);
CREATE POLICY consent_answer ON consents FOR UPDATE TO wasl_member
  USING (asker_id = nullif(current_setting('app.user_id',true),'')::uuid
      OR person_id = nullif(current_setting('app.user_id',true),'')::uuid)
  WITH CHECK (asker_id = nullif(current_setting('app.user_id',true),'')::uuid
      OR person_id = nullif(current_setting('app.user_id',true),'')::uuid);
-- The yes or no can only come from the person who was asked, never from the asker, and
-- nobody can change who asked whom.
CREATE OR REPLACE FUNCTION consent_rules() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.asker_id <> OLD.asker_id OR NEW.person_id <> OLD.person_id
     OR NEW.connection_id <> OLD.connection_id OR NEW.asker_name <> OLD.asker_name
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'a recording request cannot be moved to other people';
  END IF;
  IF NEW.status IN ('allowed','declined') AND NEW.status IS DISTINCT FROM OLD.status
     AND (OLD.status <> 'asked'
       OR current_setting('app.user_id',true) IS DISTINCT FROM OLD.person_id::text) THEN
    RAISE EXCEPTION 'only the person asked can answer, and only once';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS consent_rules ON consents;
CREATE TRIGGER consent_rules BEFORE UPDATE ON consents
  FOR EACH ROW EXECUTE FUNCTION consent_rules();
REVOKE ALL ON consents FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON consents FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON consents FROM authenticated;
  END IF;
END $$;
