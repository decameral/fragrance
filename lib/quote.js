class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function cents(value) {
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw new Error('Invalid catalogue price');
  return Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
}
async function quote(pool, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('Выберите параметры аромата.');
  const { atmosphereId, accentId, bottleId } = input;
  if (![atmosphereId, accentId].every(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,50}$/.test(id))
      || !Number.isSafeInteger(bottleId) || bottleId <= 0) {
    throw new InputError('Выберите атмосферу, совместимую ноту и флакон.');
  }
  const [[composition]] = await pool.execute(`SELECT a.id AS atmosphere_id, a.title AS atmosphere_title,
    a.price_per_ml AS base_price, n.id AS accent_id, n.name AS accent_name, n.price_per_ml AS accent_price
    FROM atmospheres a JOIN atmosphere_accents aa ON aa.atmosphere_id = a.id
    JOIN accents n ON n.id = aa.accent_id WHERE a.id = ? AND n.id = ?`, [atmosphereId, accentId]);
  if (!composition) throw new InputError('Эта нота недоступна для выбранной атмосферы.', 422);
  const [[bottle]] = await pool.execute('SELECT id, name, volume_ml, price FROM bottles WHERE id = ? AND active = TRUE', [bottleId]);
  if (!bottle) throw new InputError('Выбранный флакон недоступен.', 422);
  const totalMinor = (cents(composition.base_price) + cents(composition.accent_price)) * bottle.volume_ml + cents(bottle.price);
  return {
    atmosphere: { id: composition.atmosphere_id, title: composition.atmosphere_title },
    accent: { id: composition.accent_id, name: composition.accent_name },
    bottle: { id: bottle.id, name: bottle.name, volumeMl: bottle.volume_ml },
    totalMinor, currency: 'BYN',
  };
}
module.exports = { quote, cents, InputError };
