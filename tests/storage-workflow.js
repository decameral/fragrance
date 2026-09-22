const assert = require('node:assert/strict');
const { changeStatus } = require('../lib/order-status');

module.exports = async function storageTests(t, pool) {
  await t.test('15 tables and reference constraints protect storage', async () => {
    const [[count]] = await pool.query('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = \'BASE TABLE\'');
    assert.equal(count.n, 15);
    await assert.rejects(pool.query("UPDATE users SET role = 'invented' LIMIT 1"), { code: 'ER_NO_REFERENCED_ROW_2' });
    await assert.rejects(pool.query("UPDATE accents SET category = 'missing-category' LIMIT 1"), { code: 'ER_NO_REFERENCED_ROW_2' });
    await assert.rejects(pool.query("UPDATE orders SET status = 'invented' LIMIT 1"), { code: 'ER_NO_REFERENCED_ROW_2' });
  });
  await t.test('status and history roll back together on history failure', async () => {
    const [[order]] = await pool.query('SELECT id, user_id, status FROM orders ORDER BY id LIMIT 1');
    await pool.execute("UPDATE orders SET status = 'new' WHERE id = ?", [order.id]);
    const [[before]] = await pool.execute('SELECT COUNT(*) n FROM order_status_history WHERE order_id = ?', [order.id]);
    await pool.query("CREATE TRIGGER reject_history BEFORE INSERT ON order_status_history FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'test rollback'");
    try {
      await assert.rejects(changeStatus(pool, order.id, order.user_id, 'admin', 'new', 'processing'), { code: 'ER_SIGNAL_EXCEPTION' });
      const [[after]] = await pool.execute('SELECT status FROM orders WHERE id = ?', [order.id]);
      assert.equal(after.status, 'new');
      const [[history]] = await pool.execute('SELECT COUNT(*) n FROM order_status_history WHERE order_id = ?', [order.id]);
      assert.equal(history.n, before.n);
    } finally {
      await pool.query('DROP TRIGGER reject_history');
      await pool.execute('UPDATE orders SET status = ? WHERE id = ?', [order.status, order.id]);
    }
  });
};
