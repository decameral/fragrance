const express = require('express');
const catalog = require('../lib/catalog');
const { InputError } = require('../lib/quote');
const { id } = require('../lib/validation');
const { getOrder } = require('../lib/shop');
const { allowed, changeStatus } = require('../lib/order-status');

function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new InputError('Некорректная дата.');
  return value;
}
function adminRoutes(pool) {
  const router = express.Router();
  // Mounted after the shared session, CSRF and authentication middleware.
  router.use((req, res, next) => { if (req.user.role !== 'admin') throw new InputError('Доступно только администратору.', 403); next(); });
  router.get('/images', async (req, res) => res.json({ images: await catalog.images() }));
  router.get('/catalog/:kind', async (req, res) => res.json(await catalog.list(pool, req.params.kind, req.query)));
  router.post('/catalog/:kind', async (req, res) => res.status(201).json(await catalog.save(pool, req.params.kind, undefined, req.body)));
  router.put('/catalog/:kind/:id', async (req, res) => res.json(await catalog.save(pool, req.params.kind, req.params.id, req.body)));
  router.patch('/catalog/:kind/:id/visibility', async (req, res) => {
    const def = catalog.definition(req.params.kind);
    if (typeof req.body.active !== 'boolean') throw new InputError('Укажите доступность позиции.');
    const [result] = await pool.execute(`UPDATE ${def.table} SET active = ? WHERE id = ?`, [req.body.active ? 1 : 0, catalog.recordId(req.params.kind, req.params.id)]);
    if (!result.affectedRows) throw new InputError('Позиция не найдена.', 404);
    res.json({ ok: true });
  });
  router.delete('/catalog/:kind/:id', async (req, res) => { await catalog.remove(pool, req.params.kind, req.params.id); res.json({ ok: true }); });
  router.get('/atmospheres/:id/accents', async (req, res) => {
    const atmosphereId = catalog.slug(req.params.id);
    const [[atmosphere]] = await pool.execute('SELECT id, title FROM atmospheres WHERE id = ?', [atmosphereId]);
    if (!atmosphere) throw new InputError('Атмосфера не найдена.', 404);
    const [accents] = await pool.query('SELECT id, name, active FROM accents ORDER BY name, id');
    const [links] = await pool.execute('SELECT accent_id FROM atmosphere_accents WHERE atmosphere_id = ?', [atmosphereId]);
    res.json({ atmosphere, accents, selectedIds: links.map(link => link.accent_id) });
  });
  router.put('/atmospheres/:id/accents', async (req, res) => { await catalog.compatibility(pool, req.params.id, req.body.accentIds); res.json({ ok: true }); });
  router.get('/orders', async (req, res) => {
    const page = catalog.pageNumber(req.query.page);
    const where = []; const args = [];
    if (req.query.number) { where.push('id = ?'); args.push(id(req.query.number)); }
    if (req.query.status) {
      if (typeof req.query.status !== 'string') throw new InputError('Некорректный статус.');
      const [[status]] = await pool.execute('SELECT code FROM order_statuses WHERE code = ?', [req.query.status]);
      if (!status) throw new InputError('Некорректный статус.');
      where.push('status = ?'); args.push(req.query.status);
    }
    if (req.query.from) { where.push('created_at >= ?'); args.push(date(req.query.from)); }
    if (req.query.to) { where.push('created_at < DATE_ADD(?, INTERVAL 1 DAY)'); args.push(date(req.query.to)); }
    if (req.query.from && req.query.to && req.query.from > req.query.to) throw new InputError('Начало периода позже окончания.');
    const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [[count]] = await pool.execute(`SELECT COUNT(*) AS total FROM orders ${filter}`, args);
    const [items] = await pool.query(`SELECT id, customer_name, status, total_minor, currency, created_at FROM orders ${filter} ORDER BY id DESC LIMIT 25 OFFSET ?`, [...args, (page - 1) * 25]);
    res.json({ items, page, pages: Math.max(1, Math.ceil(count.total / 25)), total: count.total });
  });
  router.get('/orders/:id', async (req, res) => {
    const orderId = id(req.params.id);
    const [[owner]] = await pool.execute('SELECT user_id FROM orders WHERE id = ?', [orderId]);
    if (!owner) throw new InputError('Заказ не найден.', 404);
    const order = await getOrder(pool, owner.user_id, orderId);
    res.json({ ...order, allowedStatuses: await allowed(pool, order.status, 'admin') });
  });
  router.patch('/orders/:id/status', async (req, res) => {
    const { status, expectedStatus } = req.body;
    await changeStatus(pool, id(req.params.id), req.user.id, 'admin', expectedStatus, status);
    res.json({ ok: true });
  });
  return router;
}
module.exports = { adminRoutes };
