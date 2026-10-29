-- Inscriptions à la masterclass « Les 5 erreurs qui font dévier ton avenir »
CREATE TABLE IF NOT EXISTS registrations (
  id                      BIGSERIAL PRIMARY KEY,
  full_name               TEXT        NOT NULL CHECK (char_length(full_name) BETWEEN 3 AND 120),
  email                   TEXT        NOT NULL,             -- tel que saisi (nettoyé)
  email_normalized        TEXT        NOT NULL,             -- forme comparée pour les doublons
  phone_e164              TEXT        NOT NULL,             -- numéro international normalisé (+224…)
  phone_country           TEXT,                              -- pays détecté (ISO2), informatif
  consent_at              TIMESTAMPTZ NOT NULL,
  confirmation_email_sent BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT registrations_email_unique UNIQUE (email_normalized),
  CONSTRAINT registrations_phone_unique UNIQUE (phone_e164)
);

CREATE INDEX IF NOT EXISTS registrations_created_at_idx ON registrations (created_at);
