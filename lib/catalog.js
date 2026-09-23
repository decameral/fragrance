const fs = require('node:fs/promises');
const path = require('node:path');
const { InputError } = require('./quote');
const { text, id } = require('./validation');

// SQL identifiers come only from this allowlist, never from request text.
const definitions = {
  atmospheres: { table: 'atmospheres', name: 'title', price: 'price_per_ml', fields: ['title', 'subtitle', 'description', 'image', 'base_accord', 'price_per_ml', 'active'] },
  accents: { table: 'accents', name: 'name', price: 'price_per_ml', fields: ['name', 'category', 'description', 'price_per_ml', 'active'] },
  bottles: { table: 'bottles', name: 'name', price: 'price', fields: ['name', 'volume_ml', 'price', 'active'] },
};
function definition(kind) {
  if (!Object.hasOwn(definitions, kind)) throw new InputError('Справочник не найден.', 404);
  return definitions[kind];
}
function slug(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(value)) throw new InputError('Код: от 1 до 50 латинских букв, цифр, дефисов или подчёркиваний.');
  return value;
}
function recordId(kind, value) { return kind === 'bottles' ? id(value) : slug(value); }
function price(value) {
  if (typeof value !== 'string' || !/^\d{1,6}(\.\d{1,2})?$/.test(value)) throw new InputError('Цена: от 0 до 999999.99, не более двух знаков после точки.');
  const [whole, fraction = ''] = value.split('.');
  return `${Number(whole)}.${fraction.padEnd(2, '0')}`;
}
function pageNumber(value = '1') {
  if (typeof value !== 'string' || !/^[1-9]\d{0,5}$/.test(value)) throw new InputError('Некорректный номер страницы.');
  return Number(value);
}
async function images() {
  const files = await fs.readdir(path.join(__dirname, '../images'), { withFileTypes: true });
  return files.filter(file => file.isFile() && /^[\w.-]+\.(png|jpe?g|webp|svg)$/i.test(file.name))
    .map(file => `images/${file.name}`).sort();
}
async function values(kind, body) {
  definition(kind);
  if (typeof body.active !== 'boolean') throw new InputError('Укажите доступность позиции.');
  const active = body.active ? 1 : 0;
  if (kind === 'bottles') {
    if (!Number.isInteger(body.volume_ml) || body.volume_ml < 1 || body.volume_ml > 1000) throw new InputError('Объём должен быть от 1 до 1000 мл.');
    return [text(body.name, 'Название', 100), body.volume_ml, price(body.price), active];
  }
  const description = text(typeof body.description === 'string' ? body.description.replace(/\r?\n/g, ' ') : body.description, 'Описание', 4000);
  if (kind === 'accents') return [text(body.name, 'Название', 100), text(body.category, 'Категория', 50), description, price(body.price_per_ml), active];
  if (!(await images()).includes(body.image)) throw new InputError('Выберите существующее изображение из списка.');
  if (!Array.isArray(body.base_accord) || body.base_accord.length < 1 || body.base_accord.length > 12) throw new InputError('Укажите от 1 до 12 базовых нот.');
  const accords = body.base_accord.map(note => text(note, 'Базовая нота', 60));
  return [text(body.title, 'Название', 255), text(body.subtitle, 'Краткое описание', 255), description,
    body.image, JSON.stringify(accords), price(body.price_per_ml), active];
}
async function list(pool, kind, query) {
  const def = definition(kind);
  const page = pageNumber(query.page);
  const q = text(query.q ?? '', 'Поиск', 100, 0);
  const sort = query.sort ?? 'name'; const direction = query.direction ?? 'asc'; const state = query.state ?? 'all';
  if (!['name', 'price'].includes(sort) || !['asc', 'desc'].includes(direction) || !['all', 'active', 'hidden'].includes(state)) throw new InputError('Некорректные параметры списка.');
  const filters = [`(LOCATE(LOWER(?), LOWER(${def.name})) > 0 OR LOCATE(LOWER(?), LOWER(CAST(id AS CHAR))) > 0)`];
  const args = [q, q];
  if (state !== 'all') { filters.push('active = ?'); args.push(state === 'active' ? 1 : 0); }
  const where = filters.join(' AND ');
  const [[count]] = await pool.execute(`SELECT COUNT(*) AS total FROM ${def.table} WHERE ${where}`, args);
  const column = sort === 'name' ? def.name : def.price;
  const [items] = await pool.query(`SELECT * FROM ${def.table} WHERE ${where} ORDER BY ${column} ${direction.toUpperCase()}, id ASC LIMIT 25 OFFSET ?`, [...args, (page - 1) * 25]);
  return { items, page, pages: Math.max(1, Math.ceil(count.total / 25)), total: count.total };
}
async function saveRecord(pool, kind, inputId, body) {
  const def = definition(kind);
  const data = await values(kind, body);
  if (kind === 'accents') await pool.execute('INSERT INTO accent_categories (name) VALUES (?) ON DUPLICATE KEY UPDATE name = name', [data[1]]);
  const record = inputId === undefined ? (kind === 'bottles' ? undefined : slug(body.id)) : recordId(kind, inputId);
  try {
    if (inputId !== undefined) {
      const [result] = await pool.execute(`UPDATE ${def.table} SET ${def.fields.map(field => `${field} = ?`).join(', ')} WHERE id = ?`, [...data, record]);
      if (!result.affectedRows) throw new InputError('Позиция не найдена.', 404);
      return { id: record };
    }
    const fields = record === undefined ? def.fields : ['id', ...def.fields];
    const args = record === undefined ? data : [record, ...data];
    const [result] = await pool.execute(`INSERT INTO ${def.table} (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`, args);
    return { id: record ?? result.insertId };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new InputError('Позиция с таким кодом или сочетанием названия и объёма уже есть.', 409);
    throw error;
  }
}
async function save(pool, kind, inputId, body) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const result = await saveRecord(db, kind, inputId, body);
    await db.commit(); return result;
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}
async function remove(pool, kind, inputId) {
  const def = definition(kind); const record = recordId(kind, inputId);
  try {
    const [result] = await pool.execute(`DELETE FROM ${def.table} WHERE id = ?`, [record]);
    if (!result.affectedRows) throw new InputError('Позиция не найдена.', 404);
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2') throw new InputError('Позиция используется в корзине или заказе. Скройте её вместо удаления.', 409);
    throw error;
  }
}
async function compatibility(pool, inputId, accentIds) {
  const atmosphereId = slug(inputId);
  if (!Array.isArray(accentIds) || accentIds.length > 200) throw new InputError('Укажите список совместимых нот (не более 200).');
  const selected = [...new Set(accentIds.map(slug))].sort();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[atmosphere]] = await connection.execute('SELECT id FROM atmospheres WHERE id = ? FOR UPDATE', [atmosphereId]);
    if (!atmosphere) throw new InputError('Атмосфера не найдена.', 404);
    for (const accentId of selected) {
      const [[accent]] = await connection.execute('SELECT id FROM accents WHERE id = ? FOR SHARE', [accentId]);
      if (!accent) throw new InputError('Одна из выбранных нот больше не существует.', 422);
    }
    await connection.execute('DELETE FROM atmosphere_accents WHERE atmosphere_id = ?', [atmosphereId]);
    for (const accentId of selected) await connection.execute('INSERT INTO atmosphere_accents (atmosphere_id, accent_id) VALUES (?, ?)', [atmosphereId, accentId]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
module.exports = { definition, recordId, slug, pageNumber, images, values, list, save, remove, compatibility };
