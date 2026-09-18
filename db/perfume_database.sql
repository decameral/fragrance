-- 1. Создание базы данных (если еще не создана)
CREATE DATABASE IF NOT EXISTS scent_craft_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE scent_craft_db;

-- 2. Таблица атмосфер (настроений)
CREATE TABLE IF NOT EXISTS atmospheres (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    subtitle VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    image VARCHAR(255) NOT NULL,
    base_accord JSON NOT NULL -- Сохраняем массив ингредиентов базового аккорда
);

-- 3. Таблица акцентных нот
CREATE TABLE IF NOT EXISTS accents (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT NOT NULL
);

-- 4. Связывающая таблица (какие акценты подходят к какой атмосфере)
CREATE TABLE IF NOT EXISTS atmosphere_accents (
    atmosphere_id VARCHAR(50),
    accent_id VARCHAR(50),
    PRIMARY KEY (atmosphere_id, accent_id),
    FOREIGN KEY (atmosphere_id) REFERENCES atmospheres(id) ON DELETE CASCADE,
    FOREIGN KEY (accent_id) REFERENCES accents(id) ON DELETE CASCADE
);

-- ========================================================
-- НАПОЛНЕНИЕ ДАННЫМИ
-- ========================================================

-- Наполнение атмосфер
INSERT INTO atmospheres (id, title, subtitle, description, image, base_accord) VALUES
('pine_forest', 'Утро в сосновом лесу', 'Свежий, древесно-озоновый аромат', 'Прохладный утренний туман, запах влажной хвои, чистый озоновый воздух и теплая смола.', 'images/pine.png', '["Сибирская сосна", "Озон", "Влажная древесина", "Белый мускус"]'),
('amalfi_sunset', 'Закат на побережье Амальфи', 'Яркий, цитрусово-морской аромат', 'Морской бриз, сочные итальянские цитрусы и согретые солнцем цветы нероли.', 'images/amalfi.png', '["Сицилийский лимон", "Морская соль", "Нероли", "Серая амбра"]'),
('cozy_fireplace', 'Уютный вечер у камина', 'Теплый, пряный, древесный аромат', 'Потрескивание дров, мягкий плед, дымные ноты, пряный чабрец и сладковатая ваниль.', 'images/fireplace.png', '["Дымный кедр", "Гвоздика", "Амбра", "Бобы тонка"]'),
('paris_coffee', 'Парижская кофейня', 'Гурманский, мягкий, цветочный аромат', 'Запах свежеобжаренных зерен, сливочных круассанов и нежного букета цветов на столе.', 'images/paris.png', '["Черный кофе", "Сливки", "Дамасская роза", "Сандал"]');


USE scent_craft_db;

UPDATE atmospheres 
SET image = CASE id
    WHEN 'pine_forest' THEN 'images/pine.png'
    WHEN 'amalfi_sunset' THEN 'images/amalfi.png'
    WHEN 'cozy_fireplace' THEN 'images/fireplace.png'
    WHEN 'paris_coffee' THEN 'images/paris.png'
END
WHERE id IN ('pine_forest', 'amalfi_sunset', 'cozy_fireplace', 'paris_coffee');
-- Наполнение акцентов
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

-- Связи между атмосферами и акцентами
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