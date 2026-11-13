-- Schéma D1. Les analyses sont rangées par pseudo chess.com (partagées entre comptes),
-- la progression par compte de l'app (jamais partagée).

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created INTEGER NOT NULL
);

-- Pseudos chess.com suivis par un compte (le sien, ses adversaires…).
CREATE TABLE follows (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  username TEXT NOT NULL,          -- en minuscules
  own INTEGER NOT NULL DEFAULT 0,  -- 1 = c'est le joueur du compte
  added INTEGER NOT NULL,
  PRIMARY KEY (account_id, username)
);

-- Parties normalisées (format Game, sans les évaluations).
CREATE TABLE games (
  username TEXT NOT NULL,
  id TEXT NOT NULL,
  t INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (username, id)
);
CREATE INDEX games_t ON games (username, t);

-- Analyse moteur d'une partie : évaluations, classes de coups, statistiques.
CREATE TABLE analyses (
  username TEXT NOT NULL,
  game_id TEXT NOT NULL,
  depth INTEGER NOT NULL,
  ev TEXT NOT NULL,
  cls TEXT NOT NULL,
  st TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (username, game_id)
);

-- Fautes extraites (exercices du Woodpecker).
CREATE TABLE faults (
  username TEXT NOT NULL,
  id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  t INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (username, id)
);
CREATE INDEX faults_t ON faults (username, t);

-- Progression d'un compte (répétition espacée, cycles Woodpecker, réglages) : clé → JSON, la dernière écriture gagne.
CREATE TABLE progress (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (account_id, key)
);

INSERT INTO accounts (id, name, created) VALUES ('me', 'Matthieu', unixepoch() * 1000);
INSERT INTO follows (account_id, username, own, added) VALUES ('me', 'matt_chess00', 1, unixepoch() * 1000);
