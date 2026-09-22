const { InputError } = require('./quote');

async function allowed(db, status, role) {
  const [rows] = await db.execute('SELECT to_status FROM order_status_transitions WHERE from_status = ? AND role_code = ? ORDER BY to_status', [status, role]);
  return rows.map(row => row.to_status);
}
async function changeStatus(pool, orderId, actorId, role, expected, next, ownOnly = false) {
  if (typeof expected !== 'string' || typeof next !== 'string' || !(await allowed(pool, expected, role)).includes(next)) throw new InputError('Недопустимый переход статуса.', 422);
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[order]] = await db.execute('SELECT user_id, status FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (!order || (ownOnly && order.user_id !== actorId) || order.status !== expected) throw new InputError('Заказ изменён или недоступен. Обновите список.', 409);
    await db.execute('UPDATE orders SET status = ? WHERE id = ?', [next, orderId]);
    await db.execute("INSERT INTO order_status_history (order_id, from_status, to_status, actor_id, event_kind) VALUES (?, ?, ?, ?, 'changed')", [orderId, expected, next, actorId]);
    await db.commit();
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}
module.exports = { allowed, changeStatus };
