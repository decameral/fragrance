-- Structure reference after migrations 001-004. No data or credentials.
-- For application setup use the seed and npm run migrate; do not import over an existing database.

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
