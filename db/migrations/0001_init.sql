-- Harmonia — schéma initial (PostgreSQL 14+).
-- Les données théoriques (gammes, accords, intervalles) ne sont PAS stockées :
-- elles sont calculées par le moteur harmonia-theory.

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    settings      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  BYTEA NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- owner_id NULL = preset fourni par l'application.
-- definition = sérialisation de harmonia_theory::Instrument.
CREATE TABLE instruments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID REFERENCES users (id) ON DELETE CASCADE,
    slug        TEXT NOT NULL,
    name        TEXT NOT NULL,
    family      TEXT NOT NULL CHECK (family IN
                  ('keyboard','plucked_string','bowed_string','woodwind','brass','percussion','electronic')),
    definition  JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX instruments_owner_slug_key
    ON instruments (COALESCE(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);

CREATE TABLE tracks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    artist       TEXT,
    source_kind  TEXT NOT NULL CHECK (source_kind IN ('audio','midi')),
    duration_ms  INTEGER CHECK (duration_ms >= 0),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tracks_owner_idx ON tracks (owner_id, created_at DESC);

-- Un objet dans RustFS (S3). La base ne contient jamais d'audio.
CREATE TABLE audio_assets (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id      UUID NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
    kind          TEXT NOT NULL CHECK (kind IN ('original','waveform_peaks','stem','midi_export')),
    bucket        TEXT NOT NULL,
    object_key    TEXT NOT NULL,
    content_type  TEXT NOT NULL,
    byte_size     BIGINT NOT NULL CHECK (byte_size >= 0),
    sha256        BYTEA,
    sample_rate   INTEGER,
    channels      SMALLINT,
    label         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (bucket, object_key)
);
CREATE INDEX audio_assets_track_idx ON audio_assets (track_id, kind);

-- File de tâches : un worker réclame un job avec FOR UPDATE SKIP LOCKED.
-- Un job 'running' dont heartbeat_at est périmé est remis en 'queued' et
-- reprend à partir de checkpoint.
CREATE TABLE analysis_jobs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id         UUID NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
    owner_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    mode             TEXT NOT NULL CHECK (mode IN ('basic','fundamental','advanced','complex','custom')),
    features         TEXT[] NOT NULL,
    range_start_ms   INTEGER CHECK (range_start_ms >= 0),
    range_end_ms     INTEGER,
    status           TEXT NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
    stage            TEXT,
    progress         REAL NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 1),
    attempt          INTEGER NOT NULL DEFAULT 0,
    max_attempts     INTEGER NOT NULL DEFAULT 3,
    worker_id        TEXT,
    heartbeat_at     TIMESTAMPTZ,
    checkpoint       JSONB NOT NULL DEFAULT '{}'::jsonb,
    engine_versions  JSONB NOT NULL DEFAULT '{}'::jsonb,
    error            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at       TIMESTAMPTZ,
    finished_at      TIMESTAMPTZ,
    CHECK (range_end_ms IS NULL OR range_start_ms IS NULL OR range_end_ms > range_start_ms)
);
CREATE INDEX analysis_jobs_queue_idx ON analysis_jobs (created_at) WHERE status = 'queued';
CREATE INDEX analysis_jobs_running_idx ON analysis_jobs (heartbeat_at) WHERE status = 'running';
CREATE INDEX analysis_jobs_track_idx ON analysis_jobs (track_id, created_at DESC);

-- Résultats bruts, immuables. payload est validé par le domaine Rust selon feature.
CREATE TABLE analysis_events (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id      UUID NOT NULL REFERENCES analysis_jobs (id) ON DELETE CASCADE,
    track_id    UUID NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
    feature     TEXT NOT NULL,
    start_ms    INTEGER NOT NULL CHECK (start_ms >= 0),
    end_ms      INTEGER NOT NULL,
    confidence  REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    certainty   TEXT NOT NULL CHECK (certainty IN ('detected','estimated','uncertain')),
    payload     JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_ms >= start_ms)
);
CREATE INDEX analysis_events_timeline_idx ON analysis_events (track_id, feature, start_ms);
CREATE INDEX analysis_events_job_idx ON analysis_events (job_id);

-- Corrections manuelles : couche appliquée à la lecture, jamais d'écrasement.
--   replace : event_id requis, payload remplace celui de l'événement
--   delete  : event_id requis
--   insert  : event_id NULL, feature/start_ms/end_ms/payload requis
CREATE TABLE analysis_corrections (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id    UUID NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    event_id    BIGINT REFERENCES analysis_events (id) ON DELETE CASCADE,
    action      TEXT NOT NULL CHECK (action IN ('replace','delete','insert')),
    feature     TEXT,
    start_ms    INTEGER,
    end_ms      INTEGER,
    payload     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (action = 'delete'  AND event_id IS NOT NULL) OR
        (action = 'replace' AND event_id IS NOT NULL AND payload IS NOT NULL) OR
        (action = 'insert'  AND event_id IS NULL AND feature IS NOT NULL
             AND start_ms IS NOT NULL AND end_ms IS NOT NULL AND payload IS NOT NULL)
    )
);
CREATE INDEX analysis_corrections_track_idx ON analysis_corrections (track_id);
CREATE INDEX analysis_corrections_event_idx ON analysis_corrections (event_id);

-- Les cours vivent dans content/lessons ; seule la progression est stockée.
CREATE TABLE lesson_progress (
    user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    lesson_slug      TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed')),
    completed_steps  JSONB NOT NULL DEFAULT '[]'::jsonb,
    best_score       REAL CHECK (best_score BETWEEN 0 AND 1),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, lesson_slug)
);

CREATE TABLE ear_sessions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    exercise_type  TEXT NOT NULL CHECK (exercise_type IN
                     ('note','interval','chord','progression','rhythm','tempo','time_signature')),
    level          SMALLINT NOT NULL CHECK (level >= 1),
    started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at    TIMESTAMPTZ
);
CREATE INDEX ear_sessions_user_idx ON ear_sessions (user_id, started_at DESC);

CREATE TABLE ear_attempts (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id   UUID NOT NULL REFERENCES ear_sessions (id) ON DELETE CASCADE,
    skill_key    TEXT NOT NULL,
    question     JSONB NOT NULL,
    expected     JSONB NOT NULL,
    answer       JSONB NOT NULL,
    correct      BOOLEAN NOT NULL,
    response_ms  INTEGER CHECK (response_ms >= 0),
    replays      SMALLINT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ear_attempts_session_idx ON ear_attempts (session_id);

-- Maîtrise par compétence (ex. 'interval:m3:ascending') et répétition espacée.
CREATE TABLE skill_stats (
    user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    skill_key  TEXT NOT NULL,
    attempts   INTEGER NOT NULL DEFAULT 0,
    correct    INTEGER NOT NULL DEFAULT 0,
    ease       REAL NOT NULL DEFAULT 2.5,
    interval_days REAL NOT NULL DEFAULT 0,
    due_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, skill_key),
    CHECK (correct <= attempts)
);
CREATE INDEX skill_stats_due_idx ON skill_stats (user_id, due_at);

CREATE TABLE compositions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    key_tonic   TEXT NOT NULL,
    scale_type  TEXT NOT NULL,
    tempo_bpm   REAL NOT NULL CHECK (tempo_bpm > 0),
    instrument_id UUID REFERENCES instruments (id) ON DELETE SET NULL,
    content     JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX compositions_owner_idx ON compositions (owner_id, updated_at DESC);

CREATE TABLE library_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    item_type   TEXT NOT NULL CHECK (item_type IN
                  ('track','composition','progression','chord','scale','lesson')),
    ref_id      UUID,
    title       TEXT NOT NULL,
    data        JSONB NOT NULL DEFAULT '{}'::jsonb,
    tags        TEXT[] NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX library_items_owner_idx ON library_items (owner_id, item_type, created_at DESC);
CREATE INDEX library_items_tags_idx ON library_items USING GIN (tags);
