-- Harmonie — comptes gérés par Supabase Auth, résumé des analyses, et
-- fermeture de l'accès direct aux tables.

-- Les comptes, mots de passe et sessions sont gérés par Supabase Auth.
-- users.id reprend l'identifiant du compte (« sub » du jeton d'accès).
DROP TABLE sessions;
ALTER TABLE users DROP COLUMN password_hash;
ALTER TABLE users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
DROP INDEX users_email_key;
CREATE INDEX users_email_idx ON users (lower(email));

-- Informations globales d'une analyse (durée, accordage, grille des temps).
ALTER TABLE analysis_jobs ADD COLUMN summary JSONB;

-- Sur Supabase, le schéma public est exposé par l'API de données à quiconque
-- détient la clé publique du projet. Activer RLS sans aucune politique ferme
-- cet accès : seule l'API Harmonie (rôle propriétaire, qui contourne RLS)
-- lit et écrit ces tables. Sans effet gênant sur un PostgreSQL ordinaire.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;
