CREATE TABLE IF NOT EXISTS terms_records (
  subject_type TEXT NOT NULL CHECK (subject_type IN ('telegram', 'browser')),
  subject_id TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  first_visited_at TEXT NOT NULL,
  terms_accepted INTEGER NOT NULL DEFAULT 0 CHECK (terms_accepted IN (0, 1)),
  accepted_at TEXT,
  accepted_locale TEXT CHECK (accepted_locale IN ('uk', 'en')),
  PRIMARY KEY (subject_type, subject_id, policy_version),
  CHECK (
    (terms_accepted = 0 AND accepted_at IS NULL AND accepted_locale IS NULL)
    OR (terms_accepted = 1 AND accepted_at IS NOT NULL AND accepted_locale IS NOT NULL)
  )
);
