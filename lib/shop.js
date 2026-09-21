const { createHash } = require('node:crypto');
const { quote, InputError } = require('./quote');
const validate = require('./validation');

async function transaction(pool, userId, action) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Serialize this user's basket changes and checkout, including two tabs.
    await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
    const result = await action(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}
async function cart(db, userId, lock = false) {
  const [rows] = await db.execute('SELECT * FROM cart_items WHERE user_id = ? ORDER BY id' + (lock ? ' FOR UPDATE' : ''), [userId]);
  const items = [];
  for (const row of rows) {
    const item = { id: row.id, name: row.perfume_name, quantity: row.quantity,
      atmosphereId: row.atmosphere_id, accentId: row.accent_id, bottleId: row.bottle_id };
    try { item.quote = await quote(db, item, lock); }
    catch (error) { if (!(error instanceof InputError)) throw error; item.error = error.message; }
    items.push(item);
  }
  const totalMinor = items.reduce((sum, item) => sum + (item.quote?.totalMinor || 0) * item.quantity, 0);
  if (!Number.isSafeInteger(totalMinor)) throw new InputError('Сумма корзины превышает допустимую.', 422);
  const revision = createHash('sha256').update(JSON.stringify(items)).digest('hex');
  return { items, totalMinor, currency: 'BYN', revision, canCheckout: items.length > 0 && items.every(item => item.quote) };
}
async function changeCart(pool, userId, action, input) {
  return transaction(pool, userId, async db => {
    if (action === 'add') {
      const name = validate.text(input.name, 'Название аромата', 80);
      const quantity = validate.quantity(input.quantity ?? 1);
      await quote(db, input, true);
      const [[count]] = await db.execute('SELECT COUNT(*) AS n FROM cart_items WHERE user_id = ?', [userId]);
      if (count.n >= 20) throw new InputError('В корзине может быть не более 20 композиций.', 422);
      await db.execute('INSERT INTO cart_items (user_id, atmosphere_id, accent_id, bottle_id, perfume_name, quantity) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, input.atmosphereId, input.accentId, input.bottleId, name, quantity]);
    } else {
      const [[row]] = await db.execute('SELECT id FROM cart_items WHERE id = ? AND user_id = ?', [input.id, userId]);
      if (!row) throw new InputError('Позиция не найдена.', 404);
      if (action === 'delete') await db.execute('DELETE FROM cart_items WHERE id = ? AND user_id = ?', [input.id, userId]);
      else await db.execute('UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?', [validate.quantity(input.quantity), input.id, userId]);
    }
    return cart(db, userId, true);
  });
}
async function getOrder(db, userId, orderId) {
  const [[order]] = await db.execute('SELECT id, customer_name, phone, comment, status, total_minor, currency, created_at FROM orders WHERE id = ? AND user_id = ?', [orderId, userId]);
  if (!order) throw new InputError('Заказ не найден.', 404);
  const [items] = await db.execute('SELECT atmosphere_title, accent_name, bottle_name, volume_ml, perfume_name, quantity, unit_minor FROM order_items WHERE order_id = ? ORDER BY id', [orderId]);
  return { ...order, items };
}
async function checkout(pool, userId, input) {
  const name = validate.text(input.name, 'Имя', 80);
  const phone = validate.phone(input.phone);
  const comment = validate.text(input.comment ?? '', 'Комментарий', 500, 0);
  if (typeof input.checkoutKey !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.checkoutKey)
    || typeof input.revision !== 'string' || !/^[a-f0-9]{64}$/.test(input.revision)) throw new InputError('Обновите корзину перед оформлением.');
  return transaction(pool, userId, async db => {
    const [[existing]] = await db.execute('SELECT id FROM orders WHERE user_id = ? AND checkout_key = ?', [userId, input.checkoutKey]);
    if (existing) return getOrder(db, userId, existing.id);
    const current = await cart(db, userId, true);
    if (!current.canCheckout) throw new InputError('Корзина пуста или содержит недоступные позиции.', 422);
    if (current.revision !== input.revision) throw new InputError('Состав или цены изменились. Проверьте обновлённую корзину и подтвердите заказ ещё раз.', 409);
    const [result] = await db.execute('INSERT INTO orders (user_id, checkout_key, customer_name, phone, comment, total_minor) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, input.checkoutKey, name, phone, comment, current.totalMinor]);
    for (const item of current.items) {
      const q = item.quote;
      await db.execute(`INSERT INTO order_items (order_id, atmosphere_id, accent_id, bottle_id, atmosphere_title,
        accent_name, bottle_name, volume_ml, perfume_name, quantity, unit_minor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [result.insertId, q.atmosphere.id, q.accent.id, q.bottle.id, q.atmosphere.title, q.accent.name,
        q.bottle.name, q.bottle.volumeMl, item.name, item.quantity, q.totalMinor]);
    }
    await db.execute('DELETE FROM cart_items WHERE user_id = ?', [userId]);
    return getOrder(db, userId, result.insertId);
  });
}
module.exports = { cart, changeCart, checkout, getOrder };
