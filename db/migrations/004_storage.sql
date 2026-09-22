CREATE TABLE roles (
  code VARCHAR(20) PRIMARY KEY,
  title VARCHAR(60) NOT NULL
) ENGINE=InnoDB;
INSERT INTO roles VALUES ('customer', 'Покупатель'), ('admin', 'Администратор');
ALTER TABLE users MODIFY role VARCHAR(20) NOT NULL DEFAULT 'customer';
ALTER TABLE users ADD CONSTRAINT users_role_fk FOREIGN KEY (role) REFERENCES roles(code);

CREATE TABLE accent_categories (
  name VARCHAR(50) PRIMARY KEY
) ENGINE=InnoDB;
INSERT INTO accent_categories SELECT DISTINCT category FROM accents;
ALTER TABLE accents ADD CONSTRAINT accents_category_fk FOREIGN KEY (category) REFERENCES accent_categories(name);

CREATE TABLE order_statuses (
  code VARCHAR(20) PRIMARY KEY,
  title VARCHAR(60) NOT NULL
) ENGINE=InnoDB;
INSERT INTO order_statuses VALUES ('new', 'Новый'), ('processing', 'В работе'), ('completed', 'Завершён'), ('cancelled', 'Отменён');
ALTER TABLE orders MODIFY status VARCHAR(20) NOT NULL DEFAULT 'new';
ALTER TABLE orders ADD CONSTRAINT orders_status_fk FOREIGN KEY (status) REFERENCES order_statuses(code);
CREATE TABLE order_status_transitions (
  from_status VARCHAR(20) NOT NULL,
  to_status VARCHAR(20) NOT NULL,
  role_code VARCHAR(20) NOT NULL,
  PRIMARY KEY (from_status, to_status, role_code),
  FOREIGN KEY (from_status) REFERENCES order_statuses(code),
  FOREIGN KEY (to_status) REFERENCES order_statuses(code),
  FOREIGN KEY (role_code) REFERENCES roles(code),
  CHECK (from_status <> to_status)
) ENGINE=InnoDB;
INSERT INTO order_status_transitions VALUES
('new', 'processing', 'admin'), ('new', 'cancelled', 'admin'),
('processing', 'completed', 'admin'), ('processing', 'cancelled', 'admin'),
('new', 'cancelled', 'customer');

CREATE TABLE order_status_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NOT NULL,
  actor_id INT UNSIGNED NULL,
  event_kind VARCHAR(20) NOT NULL,
  changed_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (from_status) REFERENCES order_statuses(code),
  FOREIGN KEY (to_status) REFERENCES order_statuses(code),
  FOREIGN KEY (actor_id) REFERENCES users(id),
  CHECK (event_kind IN ('created', 'changed', 'migration')),
  INDEX history_order (order_id, id)
) ENGINE=InnoDB;
INSERT INTO order_status_history (order_id, to_status, event_kind)
SELECT id, status, 'migration' FROM orders;
ALTER TABLE orders ADD INDEX orders_status_date (status, created_at), ADD INDEX orders_created (created_at);
