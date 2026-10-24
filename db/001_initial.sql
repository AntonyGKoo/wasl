CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL,
  password_hash text NOT NULL, profile jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS cards (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL, kind text NOT NULL CHECK (kind IN ('professional','social','event')),
  color text NOT NULL CHECK (color IN ('ocean','violet','coral','ink')),
  fields text[] NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id)
);
CREATE TABLE IF NOT EXISTS shares (
  id uuid PRIMARY KEY, card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE, revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (card_id,owner_id) REFERENCES cards(id,owner_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS one_live_share ON shares(card_id) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS connections (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_share_id uuid REFERENCES shares(id) ON DELETE SET NULL,
  profile jsonb NOT NULL, tags text[] NOT NULL DEFAULT '{}', event text NOT NULL DEFAULT '',
  place text NOT NULL DEFAULT '', met_on date NOT NULL DEFAULT CURRENT_DATE,
  favorite boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,owner_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS no_duplicate_share ON connections(owner_id,source_share_id) WHERE source_share_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS connections_owner ON connections(owner_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS interactions (
  id uuid PRIMARY KEY, connection_id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL, happened_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (connection_id,owner_id) REFERENCES connections(id,owner_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS interactions_contact ON interactions(owner_id,connection_id);
CREATE TABLE IF NOT EXISTS embeddings (
  connection_id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_version integer NOT NULL, model text NOT NULL, embedding vector(1536) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (connection_id,owner_id) REFERENCES connections(id,owner_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS usage_buckets (
  bucket text PRIMARY KEY, count integer NOT NULL DEFAULT 0, reset_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

-- The web server switches to this unprivileged role inside each user transaction.
-- Auth/session tables remain accessible only to the backend database connection.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='wasl_member') THEN
    CREATE ROLE wasl_member NOLOGIN;
  END IF;
END $$;
GRANT wasl_member TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO wasl_member;
GRANT SELECT,INSERT,UPDATE,DELETE ON cards,shares,connections,interactions,embeddings,audit_events TO wasl_member;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_cards ON cards TO wasl_member USING (owner_id = nullif(current_setting('app.user_id',true),'')::uuid) WITH CHECK (owner_id = nullif(current_setting('app.user_id',true),'')::uuid);
CREATE POLICY own_shares ON shares TO wasl_member USING (owner_id = nullif(current_setting('app.user_id',true),'')::uuid) WITH CHECK (owner_id = nullif(current_setting('app.user_id',true),'')::uuid);
CREATE POLICY own_connections ON connections TO wasl_member USING (owner_id = nullif(current_setting('app.user_id',true),'')::uuid) WITH CHECK (owner_id = nullif(current_setting('app.user_id',true),'')::uuid);
CREATE POLICY own_interactions ON interactions TO wasl_member USING (owner_id = nullif(current_setting('app.user_id',true),'')::uuid) WITH CHECK (owner_id = nullif(current_setting('app.user_id',true),'')::uuid);
CREATE POLICY own_embeddings ON embeddings TO wasl_member USING (owner_id = nullif(current_setting('app.user_id',true),'')::uuid) WITH CHECK (owner_id = nullif(current_setting('app.user_id',true),'')::uuid);
CREATE POLICY own_audit ON audit_events TO wasl_member USING (owner_id = nullif(current_setting('app.user_id',true),'')::uuid) WITH CHECK (owner_id = nullif(current_setting('app.user_id',true),'')::uuid);
-- No anonymous/PostgREST access. The Next.js backend is the only data API.
REVOKE ALL ON users,sessions,cards,shares,connections,interactions,embeddings,usage_buckets,audit_events FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON users,sessions,cards,shares,connections,interactions,embeddings,usage_buckets,audit_events FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON users,sessions,cards,shares,connections,interactions,embeddings,usage_buckets,audit_events FROM authenticated;
  END IF;
END $$;
