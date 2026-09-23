const catalog = require('./catalog');
const { InputError } = require('./quote');
const kinds = ['atmospheres', 'accents', 'bottles'];
const limit = 200;

function object(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) throw new InputError('Неверная структура файла каталога.');
}
async function validate(data) {
  object(data, ['version', ...kinds, 'compatibility']);
  if (data.version !== 1) throw new InputError('Поддерживается версия каталога 1.');
  const prepared = {}; const ids = {};
  for (const kind of kinds) {
    if (!Array.isArray(data[kind]) || data[kind].length > limit) throw new InputError(`Справочник ${kind}: не более ${limit} записей.`);
    prepared[kind] = []; ids[kind] = new Set();
    const def = catalog.definition(kind);
    for (const row of data[kind]) {
      object(row, ['id', ...def.fields]);
      const id = catalog.recordId(kind, row.id);
      if (kind === 'bottles' && id > 4294967295) throw new InputError('Код флакона превышает допустимый диапазон.');
      const key = String(id).toLowerCase();
      if (ids[kind].has(key)) throw new InputError('В файле повторяются идентификаторы.');
      ids[kind].add(key);
      prepared[kind].push({ id, values: await catalog.values(kind, row) });
    }
  }
  if (!Array.isArray(data.compatibility) || data.compatibility.length > 40000) throw new InputError('Неверный список совместимости.');
  const links = new Set();
  prepared.compatibility = data.compatibility.map(row => {
    object(row, ['atmosphere_id', 'accent_id']);
    const atmosphere = catalog.slug(row.atmosphere_id); const accent = catalog.slug(row.accent_id);
    const key = `${atmosphere.toLowerCase()}:${accent.toLowerCase()}`;
    if (!ids.atmospheres.has(atmosphere.toLowerCase()) || !ids.accents.has(accent.toLowerCase()) || links.has(key)) throw new InputError('Связь совместимости повторяется или ссылается на отсутствующую в файле позицию.');
    links.add(key); return [atmosphere, accent];
  });
  return prepared;
}
async function exportCatalog(pool) {
  const db = await pool.getConnection();
  try {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await db.beginTransaction();
    const data = { version: 1 };
    for (const kind of kinds) {
      const def = catalog.definition(kind);
      const [rows] = await db.query(`SELECT id, ${def.fields.join(', ')} FROM ${def.table} ORDER BY id LIMIT 201`);
      if (rows.length > limit) throw new InputError('Экспорт рассчитан на каталог до 200 позиций каждого вида.', 422);
      data[kind] = rows.map(row => ({ ...row, active: !!row.active,
        ...(kind === 'atmospheres' ? { base_accord: typeof row.base_accord === 'string' ? JSON.parse(row.base_accord) : row.base_accord } : {}) }));
    }
    [data.compatibility] = await db.query('SELECT atmosphere_id, accent_id FROM atmosphere_accents ORDER BY atmosphere_id, accent_id');
    if (Buffer.byteLength(JSON.stringify(data)) > 1024 * 1024) throw new InputError('Каталог превышает лимит обмена 1 МБ.', 422);
    await db.commit(); return data;
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}
async function importCatalog(pool, data) {
  const prepared = await validate(data);
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    for (const kind of kinds) {
      const def = catalog.definition(kind);
      for (const row of prepared[kind]) {
        const [[existing]] = await db.execute(`SELECT id FROM ${def.table} WHERE id = ? FOR UPDATE`, [row.id]);
        if (kind === 'accents') await db.execute('INSERT INTO accent_categories (name) VALUES (?) ON DUPLICATE KEY UPDATE name = name', [row.values[1]]);
        if (existing) await db.execute(`UPDATE ${def.table} SET ${def.fields.map(field => `${field} = ?`).join(', ')} WHERE id = ?`, [...row.values, row.id]);
        else await db.execute(`INSERT INTO ${def.table} (id, ${def.fields.join(', ')}) VALUES (${['id', ...def.fields].map(() => '?').join(', ')})`, [row.id, ...row.values]);
      }
    }
    for (const row of prepared.atmospheres) await db.execute('DELETE FROM atmosphere_accents WHERE atmosphere_id = ?', [row.id]);
    for (const link of prepared.compatibility) await db.execute('INSERT INTO atmosphere_accents (atmosphere_id, accent_id) VALUES (?, ?)', link);
    await db.commit();
    return { counts: Object.fromEntries([...kinds, 'compatibility'].map(kind => [kind, prepared[kind].length])) };
  } catch (error) {
    await db.rollback();
    if (error.code === 'ER_DUP_ENTRY') throw new InputError('Конфликт уникальных значений каталога. Изменения не сохранены.', 409);
    throw error;
  } finally { db.release(); }
}
module.exports = { exportCatalog, importCatalog };
