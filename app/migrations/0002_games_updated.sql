-- Date de dernière modification d'une partie (import ou analyse), pour que l'app ne redemande que ce qui a changé,
-- quelle que soit l'ancienneté de la partie. Les parties déjà là valent 0 : elles sont renvoyées une fois.
ALTER TABLE games ADD COLUMN updated INTEGER NOT NULL DEFAULT 0;
CREATE INDEX games_updated ON games (username, updated, id);
