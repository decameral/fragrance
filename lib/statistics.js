const { InputError } = require('./quote');
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01' || value > '9999-12-30' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new InputError('Укажите корректные даты периода.');
  return value;
}
async function statistics(pool, query) {
  const from = date(query.from); const to = date(query.to);
  if (from > to) throw new InputError('Начало периода позже окончания.');
  const db = await pool.getConnection();
  try {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await db.beginTransaction();
    const [statuses] = await db.execute(`SELECT s.code, s.title, COUNT(o.id) AS count FROM order_statuses s
      LEFT JOIN orders o ON o.status = s.code AND o.created_at >= ? AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)
      GROUP BY s.code, s.title ORDER BY s.code`, [from, to]);
    const [[sum]] = await db.execute("SELECT COALESCE(SUM(total_minor), 0) AS total FROM orders WHERE status = 'completed' AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)", [from, to]);
    const [popular] = await db.execute(`SELECT i.atmosphere_id, MIN(i.atmosphere_title) AS title, SUM(i.quantity) AS quantity
      FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.status = 'completed'
      AND o.created_at >= ? AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)
      GROUP BY i.atmosphere_id ORDER BY quantity DESC, i.atmosphere_id LIMIT 10`, [from, to]);
    const completedMinor = Number(sum.total);
    if (!Number.isSafeInteger(completedMinor)) throw new InputError('Сумма слишком велика. Сократите период.', 422);
    await db.commit();
    return { from, to, currency: 'BYN', totalOrders: statuses.reduce((sum, row) => sum + row.count, 0), completedMinor, statuses, popular: popular.map(row => ({ ...row, quantity: Number(row.quantity) })) };
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}
function csv(data) {
  const rows = [['Fragrance — отчёт по заказам'], ['Оформлены с', data.from, 'по', data.to],
    ['Всего заказов', data.totalOrders], ['Сумма завершённых заказов, BYN', `${Math.floor(data.completedMinor / 100)}.${String(data.completedMinor % 100).padStart(2, '0')}`],
    [], ['Статус', 'Количество'], ...data.statuses.map(row => [row.title, row.count]),
    [], ['Популярные атмосферы — только завершённые заказы'], ['Код', 'Название из истории заказов', 'Флаконов'],
    ...data.popular.map(row => [row.atmosphere_id, row.title, row.quantity])];
  return '\ufeff' + rows.map(row => row.map(value => {
    let text = String(value); if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }).join(';')).join('\r\n') + '\r\n';
}
module.exports = { statistics, csv };
