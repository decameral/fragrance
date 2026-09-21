-- Demonstration prices in BYN. Existing catalogue rows are preserved.
ALTER TABLE atmospheres ADD COLUMN price_per_ml DECIMAL(10,2) NOT NULL DEFAULT 1.50;
ALTER TABLE accents ADD COLUMN price_per_ml DECIMAL(10,2) NOT NULL DEFAULT 0.20;
CREATE TABLE bottles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  volume_ml SMALLINT UNSIGNED NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY bottle_variant (name, volume_ml),
  CHECK (volume_ml > 0), CHECK (price >= 0)
) ENGINE=InnoDB;
INSERT INTO bottles (name, volume_ml, price) VALUES
  ('Классический', 30, 10.00), ('Классический', 50, 14.00),
  ('Классический', 100, 20.00), ('Гранёный', 30, 15.00),
  ('Гранёный', 50, 19.00), ('Гранёный', 100, 27.00);
