-- Fragrance: complete initial installation for a NEW, EMPTY MySQL 8 database.
-- Select the target database in Workbench before executing this file.
-- Existing installations: use npm run migrate instead. Stop on the first SQL error.
SET NAMES utf8mb4;

CREATE TABLE `roles` (
  `code` varchar(20) NOT NULL,
  `title` varchar(60) NOT NULL,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `accent_categories` (
  `name` varchar(50) NOT NULL,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `order_statuses` (
  `code` varchar(20) NOT NULL,
  `title` varchar(60) NOT NULL,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `users` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(80) NOT NULL,
  `email` varchar(254) NOT NULL,
  `phone` varchar(30) NOT NULL DEFAULT '',
  `password_hash` varchar(100) NOT NULL,
  `role` varchar(20) NOT NULL DEFAULT 'customer',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `users_role_fk` (`role`),
  CONSTRAINT `users_role_fk` FOREIGN KEY (`role`) REFERENCES `roles` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `sessions` (
  `sid` varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `expires` bigint unsigned NOT NULL,
  `data` json NOT NULL,
  PRIMARY KEY (`sid`),
  KEY `session_expiry` (`expires`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `atmospheres` (
  `id` varchar(50) NOT NULL,
  `title` varchar(255) NOT NULL,
  `subtitle` varchar(255) NOT NULL,
  `description` text NOT NULL,
  `image` varchar(255) NOT NULL,
  `base_accord` json NOT NULL,
  `price_per_ml` decimal(10,2) NOT NULL DEFAULT '1.50',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `accents` (
  `id` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `category` varchar(50) NOT NULL,
  `description` text NOT NULL,
  `price_per_ml` decimal(10,2) NOT NULL DEFAULT '0.20',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `accents_category_fk` (`category`),
  CONSTRAINT `accents_category_fk` FOREIGN KEY (`category`) REFERENCES `accent_categories` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `atmosphere_accents` (
  `atmosphere_id` varchar(50) NOT NULL,
  `accent_id` varchar(50) NOT NULL,
  PRIMARY KEY (`atmosphere_id`,`accent_id`),
  KEY `accent_id` (`accent_id`),
  CONSTRAINT `atmosphere_accents_ibfk_1` FOREIGN KEY (`atmosphere_id`) REFERENCES `atmospheres` (`id`) ON DELETE CASCADE,
  CONSTRAINT `atmosphere_accents_ibfk_2` FOREIGN KEY (`accent_id`) REFERENCES `accents` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `bottles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `volume_ml` smallint unsigned NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `bottle_variant` (`name`,`volume_ml`),
  CONSTRAINT `bottles_chk_1` CHECK ((`volume_ml` > 0)),
  CONSTRAINT `bottles_chk_2` CHECK ((`price` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `cart_items` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `atmosphere_id` varchar(50) NOT NULL,
  `accent_id` varchar(50) NOT NULL,
  `bottle_id` int unsigned NOT NULL,
  `perfume_name` varchar(80) NOT NULL,
  `quantity` smallint unsigned NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `atmosphere_id` (`atmosphere_id`),
  KEY `accent_id` (`accent_id`),
  KEY `bottle_id` (`bottle_id`),
  CONSTRAINT `cart_items_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `cart_items_ibfk_2` FOREIGN KEY (`atmosphere_id`) REFERENCES `atmospheres` (`id`),
  CONSTRAINT `cart_items_ibfk_3` FOREIGN KEY (`accent_id`) REFERENCES `accents` (`id`),
  CONSTRAINT `cart_items_ibfk_4` FOREIGN KEY (`bottle_id`) REFERENCES `bottles` (`id`),
  CONSTRAINT `cart_items_chk_1` CHECK ((`quantity` between 1 and 20))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `orders` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `checkout_key` char(36) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  `customer_name` varchar(80) NOT NULL,
  `phone` varchar(30) NOT NULL,
  `comment` varchar(500) NOT NULL DEFAULT '',
  `status` varchar(20) NOT NULL DEFAULT 'new',
  `total_minor` bigint unsigned NOT NULL,
  `currency` char(3) NOT NULL DEFAULT 'BYN',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `checkout_once` (`user_id`,`checkout_key`),
  KEY `orders_status_date` (`status`,`created_at`),
  KEY `orders_created` (`created_at`),
  CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `orders_status_fk` FOREIGN KEY (`status`) REFERENCES `order_statuses` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `order_items` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `order_id` int unsigned NOT NULL,
  `atmosphere_id` varchar(50) NOT NULL,
  `accent_id` varchar(50) NOT NULL,
  `bottle_id` int unsigned NOT NULL,
  `atmosphere_title` varchar(255) NOT NULL,
  `accent_name` varchar(100) NOT NULL,
  `bottle_name` varchar(100) NOT NULL,
  `volume_ml` smallint unsigned NOT NULL,
  `perfume_name` varchar(80) NOT NULL,
  `quantity` smallint unsigned NOT NULL,
  `unit_minor` bigint unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `order_id` (`order_id`),
  KEY `atmosphere_id` (`atmosphere_id`),
  KEY `accent_id` (`accent_id`),
  KEY `bottle_id` (`bottle_id`),
  CONSTRAINT `order_items_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `order_items_ibfk_2` FOREIGN KEY (`atmosphere_id`) REFERENCES `atmospheres` (`id`),
  CONSTRAINT `order_items_ibfk_3` FOREIGN KEY (`accent_id`) REFERENCES `accents` (`id`),
  CONSTRAINT `order_items_ibfk_4` FOREIGN KEY (`bottle_id`) REFERENCES `bottles` (`id`),
  CONSTRAINT `order_items_chk_1` CHECK ((`quantity` between 1 and 20))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `order_status_transitions` (
  `from_status` varchar(20) NOT NULL,
  `to_status` varchar(20) NOT NULL,
  `role_code` varchar(20) NOT NULL,
  PRIMARY KEY (`from_status`,`to_status`,`role_code`),
  KEY `to_status` (`to_status`),
  KEY `role_code` (`role_code`),
  CONSTRAINT `order_status_transitions_ibfk_1` FOREIGN KEY (`from_status`) REFERENCES `order_statuses` (`code`),
  CONSTRAINT `order_status_transitions_ibfk_2` FOREIGN KEY (`to_status`) REFERENCES `order_statuses` (`code`),
  CONSTRAINT `order_status_transitions_ibfk_3` FOREIGN KEY (`role_code`) REFERENCES `roles` (`code`),
  CONSTRAINT `order_status_transitions_chk_1` CHECK ((`from_status` <> `to_status`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `order_status_history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` int unsigned NOT NULL,
  `from_status` varchar(20) DEFAULT NULL,
  `to_status` varchar(20) NOT NULL,
  `actor_id` int unsigned DEFAULT NULL,
  `event_kind` varchar(20) NOT NULL,
  `changed_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `from_status` (`from_status`),
  KEY `to_status` (`to_status`),
  KEY `actor_id` (`actor_id`),
  KEY `history_order` (`order_id`,`id`),
  CONSTRAINT `order_status_history_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `order_status_history_ibfk_2` FOREIGN KEY (`from_status`) REFERENCES `order_statuses` (`code`),
  CONSTRAINT `order_status_history_ibfk_3` FOREIGN KEY (`to_status`) REFERENCES `order_statuses` (`code`),
  CONSTRAINT `order_status_history_ibfk_4` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`),
  CONSTRAINT `order_status_history_chk_1` CHECK ((`event_kind` in (_utf8mb4'created',_utf8mb4'changed',_utf8mb4'migration')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `schema_migrations` (
  `name` varchar(180) NOT NULL,
  `applied_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Reference data and demonstration catalogue. No accounts or orders.
START TRANSACTION;
INSERT INTO roles VALUES ('customer', 'Покупатель'), ('admin', 'Администратор');
INSERT INTO order_statuses VALUES ('new', 'Новый'), ('processing', 'В работе'), ('completed', 'Завершён'), ('cancelled', 'Отменён');
INSERT INTO order_status_transitions VALUES
('new', 'processing', 'admin'), ('new', 'cancelled', 'admin'),
('processing', 'completed', 'admin'), ('processing', 'cancelled', 'admin'),
('new', 'cancelled', 'customer');
INSERT INTO accent_categories (name) VALUES
('Свежесть'), ('Пряность'), ('Сладость'), ('Загадочность'), ('Текстура'), ('Пудровость'), ('Травы');
INSERT INTO atmospheres (id, title, subtitle, description, image, base_accord) VALUES
('pine_forest', 'Утро в сосновом лесу', 'Свежий, древесно-озоновый аромат', 'Прохладный утренний туман, запах влажной хвои, чистый озоновый воздух и теплая смола.', 'images/pine.png', '["Сибирская сосна", "Озон", "Влажная древесина", "Белый мускус"]'),
('amalfi_sunset', 'Закат на побережье Амальфи', 'Яркий, цитрусово-морской аромат', 'Морской бриз, сочные итальянские цитрусы и согретые солнцем цветы нероли.', 'images/amalfi.png', '["Сицилийский лимон", "Морская соль", "Нероли", "Серая амбра"]'),
('cozy_fireplace', 'Уютный вечер у камина', 'Теплый, пряный, древесный аромат', 'Потрескивание дров, мягкий плед, дымные ноты, пряный чабрец и сладковатая ваниль.', 'images/fireplace.png', '["Дымный кедр", "Гвоздика", "Амбра", "Бобы тонка"]'),
('paris_coffee', 'Парижская кофейня', 'Гурманский, мягкий, цветочный аромат', 'Запах свежеобжаренных зерен, сливочных круассанов и нежного букета цветов на столе.', 'images/paris.png', '["Черный кофе", "Сливки", "Дамасская роза", "Сандал"]');

INSERT INTO accents (id, name, category, description) VALUES
('bergamot', 'Бергамот', 'Свежесть', 'Искристый цитрусовый акцент, придающий старту аромата сочность.'),
('pink_pepper', 'Розовый перец', 'Пряность', 'Легкая пряная пикантность с сухими древесными оттенками.'),
('green_tea', 'Зеленый чай', 'Свежесть', 'Травянистая прохлада и чувство чистоты.'),
('mint', 'Мята', 'Свежесть', 'Ледяной, бодрящий штрих для верхней ноты.'),
('vanilla', 'Мадагаскарская ваниль', 'Сладость', 'Мягкое, обволакивающее тепло без излишней приторности.'),
('incense', 'Ладан', 'Загадочность', 'Глубокий, смолисто-дымный шлейф для медитативного настроения.'),
('suede', 'Белая замша', 'Текстура', 'Бархатистая, мягкая кожаная нота для дорогого звучания.'),
('iris', 'Ирис', 'Пудровость', 'Элегантный, слегка сухой пудрово-цветочный акцент.'),
('rosemary', 'Розмарин', 'Травы', 'Ароматный пряно-смолистый травяной нюанс.'),
('cardamom', 'Кардамон', 'Пряность', 'Теплый специевый акцент с лимонным подтоном.');

INSERT INTO atmosphere_accents (atmosphere_id, accent_id) VALUES
('pine_forest', 'bergamot'),
('pine_forest', 'pink_pepper'),
('pine_forest', 'green_tea'),
('pine_forest', 'mint'),
('amalfi_sunset', 'bergamot'),
('amalfi_sunset', 'mint'),
('amalfi_sunset', 'iris'),
('amalfi_sunset', 'rosemary'),
('cozy_fireplace', 'vanilla'),
('cozy_fireplace', 'pink_pepper'),
('cozy_fireplace', 'incense'),
('cozy_fireplace', 'suede'),
('paris_coffee', 'vanilla'),
('paris_coffee', 'iris'),
('paris_coffee', 'suede'),
('paris_coffee', 'cardamom');
INSERT INTO bottles (name, volume_ml, price) VALUES
  ('Классический', 30, 10.00), ('Классический', 50, 14.00),
  ('Классический', 100, 20.00), ('Гранёный', 30, 15.00),
  ('Гранёный', 50, 19.00), ('Гранёный', 100, 27.00);

-- This installation already includes every step of migrations 001-004.
INSERT INTO schema_migrations (name) VALUES
('001_constructor.sql:1'),
('001_constructor.sql:2'),
('001_constructor.sql:3'),
('001_constructor.sql:4'),
('002_customer_orders.sql:1'),
('002_customer_orders.sql:2'),
('002_customer_orders.sql:3'),
('002_customer_orders.sql:4'),
('002_customer_orders.sql:5'),
('003_catalog_visibility.sql:1'),
('003_catalog_visibility.sql:2'),
('004_storage.sql:1'),
('004_storage.sql:2'),
('004_storage.sql:3'),
('004_storage.sql:4'),
('004_storage.sql:5'),
('004_storage.sql:6'),
('004_storage.sql:7'),
('004_storage.sql:8'),
('004_storage.sql:9'),
('004_storage.sql:10'),
('004_storage.sql:11'),
('004_storage.sql:12'),
('004_storage.sql:13'),
('004_storage.sql:14'),
('004_storage.sql:15'),
('004_storage.sql:16');
COMMIT;
