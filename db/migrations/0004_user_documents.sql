-- Harmonie — données de l'utilisateur synchronisées entre ses appareils
-- (réglages, progrès des cours, projet en cours dans Composer). L'appareil
-- reste la source : il écrit d'abord chez lui, puis envoie ici dès qu'il le
-- peut. En cas de conflit, la version modifiée le plus récemment l'emporte.
CREATE TABLE user_documents (
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    key         TEXT NOT NULL,
    value       JSONB NOT NULL,
    -- Instant de la modification sur l'appareil (millisecondes), pas de l'envoi.
    modified_ms BIGINT NOT NULL,
    PRIMARY KEY (user_id, key)
);

ALTER TABLE user_documents ENABLE ROW LEVEL SECURITY;
