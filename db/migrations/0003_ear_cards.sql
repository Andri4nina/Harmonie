-- Harmonie — fiches de répétition de l'entraînement de l'oreille, par compte.
-- Une fiche par élément (« interval:P5:asc »…) ; card = harmonia_theory::ear::Card.
CREATE TABLE ear_cards (
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    item        TEXT NOT NULL,
    card        JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, item)
);

-- Même règle que les autres tables : aucun accès direct par l'API de données.
ALTER TABLE ear_cards ENABLE ROW LEVEL SECURITY;
