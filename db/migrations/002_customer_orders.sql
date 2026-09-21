CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  phone VARCHAR(30) NOT NULL DEFAULT '',
  password_hash VARCHAR(100) NOT NULL,
  role ENUM('customer', 'admin') NOT NULL DEFAULT 'customer',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE sessions (
  sid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  expires BIGINT UNSIGNED NOT NULL,
  data JSON NOT NULL,
  INDEX session_expiry (expires)
) ENGINE=InnoDB;

CREATE TABLE cart_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  atmosphere_id VARCHAR(50) NOT NULL,
  accent_id VARCHAR(50) NOT NULL,
  bottle_id INT UNSIGNED NOT NULL,
  perfume_name VARCHAR(80) NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (atmosphere_id) REFERENCES atmospheres(id),
  FOREIGN KEY (accent_id) REFERENCES accents(id),
  FOREIGN KEY (bottle_id) REFERENCES bottles(id),
  CHECK (quantity BETWEEN 1 AND 20)
) ENGINE=InnoDB;

CREATE TABLE orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  checkout_key CHAR(36) CHARACTER SET ascii NOT NULL,
  customer_name VARCHAR(80) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  comment VARCHAR(500) NOT NULL DEFAULT '',
  status ENUM('new','processing','completed','cancelled') NOT NULL DEFAULT 'new',
  total_minor BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'BYN',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY checkout_once (user_id, checkout_key),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE order_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL,
  atmosphere_id VARCHAR(50) NOT NULL,
  accent_id VARCHAR(50) NOT NULL,
  bottle_id INT UNSIGNED NOT NULL,
  atmosphere_title VARCHAR(255) NOT NULL,
  accent_name VARCHAR(100) NOT NULL,
  bottle_name VARCHAR(100) NOT NULL,
  volume_ml SMALLINT UNSIGNED NOT NULL,
  perfume_name VARCHAR(80) NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL,
  unit_minor BIGINT UNSIGNED NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (atmosphere_id) REFERENCES atmospheres(id),
  FOREIGN KEY (accent_id) REFERENCES accents(id),
  FOREIGN KEY (bottle_id) REFERENCES bottles(id),
  CHECK (quantity BETWEEN 1 AND 20)
) ENGINE=InnoDB;
