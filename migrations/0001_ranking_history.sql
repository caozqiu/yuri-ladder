CREATE TABLE ranking_history (
 snapshot text PRIMARY KEY NOT NULL,
 season integer NOT NULL,
 observed integer NOT NULL,
 data text NOT NULL
);
CREATE INDEX ranking_history_season ON ranking_history(season, observed);
