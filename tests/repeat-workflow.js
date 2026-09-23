const assert = require('node:assert/strict');
module.exports = async function repeatTests(t, { pool, alice, bob, anonymous }) {
  const order = (await alice.call('/api/orders')).data.orders[0];
  const url = `/api/orders/${order.id}/repeat`;
  const [[item]] = await pool.execute('SELECT * FROM order_items WHERE order_id = ? LIMIT 1', [order.id]);
  await t.test('repeat checks ownership and CSRF, uses current prices and preserves old order', async () => {
    await anonymous.call('/api/auth/me');
    assert.equal((await anonymous.call(url, 'POST')).status, 401);
    assert.equal((await bob.call(url, 'POST')).status, 404);
    assert.equal((await alice.call(url, 'POST', {}, false)).status, 403);
    const [[bottle]] = await pool.execute('SELECT price FROM bottles WHERE id = ?', [item.bottle_id]);
    await pool.execute('UPDATE bottles SET price = price + 1 WHERE id = ?', [item.bottle_id]);
    try {
      const repeated = await alice.call(url, 'POST', { totalMinor: 0 });
      assert.equal(repeated.status, 200);
      assert.equal(repeated.data.items.length, 1);
      const { quote } = require('../lib/quote');
      const actual = await quote(pool, { atmosphereId: item.atmosphere_id, accentId: item.accent_id, bottleId: item.bottle_id });
      assert.equal(repeated.data.totalMinor, actual.totalMinor * item.quantity);
      assert.equal(repeated.data.items[0].name, item.perfume_name);
      assert.equal((await alice.call(`/api/orders/${order.id}`)).data.total_minor, order.total_minor);
      await alice.call(`/api/cart/${repeated.data.items[0].id}`, 'DELETE');
    } finally { await pool.execute('UPDATE bottles SET price = ? WHERE id = ?', [bottle.price, item.bottle_id]); }
  });
  await t.test('repeat respects cart capacity', async () => {
    const me = (await alice.call('/api/auth/me')).data.user;
    for (let i = 0; i < 20; i++) await pool.execute('INSERT INTO cart_items (user_id, atmosphere_id, accent_id, bottle_id, perfume_name, quantity) VALUES (?, ?, ?, ?, ?, 1)', [me.id, item.atmosphere_id, item.accent_id, item.bottle_id, 'Проверка лимита']);
    try {
      assert.equal((await alice.call(url, 'POST')).status, 422);
      assert.equal((await alice.call('/api/cart')).data.items.length, 20);
    } finally { await pool.execute('DELETE FROM cart_items WHERE user_id = ?', [me.id]); }
  });
  await t.test('repeat rejects unavailable components and rolls back partially copied compositions', async () => {
    await pool.query(`INSERT INTO order_items (order_id, atmosphere_id, accent_id, bottle_id, atmosphere_title, accent_name, bottle_name, volume_ml, perfume_name, quantity, unit_minor)
      SELECT order_id, atmosphere_id, accent_id, 2, atmosphere_title, accent_name, bottle_name, volume_ml, perfume_name, quantity, unit_minor FROM order_items WHERE id = ?`, [item.id]);
    const [[last]] = await pool.query('SELECT MAX(id) id FROM order_items');
    await pool.query('UPDATE bottles SET active = FALSE WHERE id = 2');
    try {
      assert.equal((await alice.call(url, 'POST')).status, 422);
      assert.equal((await alice.call('/api/cart')).data.items.length, 0);
    } finally { await pool.query('UPDATE bottles SET active = TRUE WHERE id = 2'); await pool.execute('DELETE FROM order_items WHERE id = ?', [last.id]); }
    await pool.execute('DELETE FROM atmosphere_accents WHERE atmosphere_id = ? AND accent_id = ?', [item.atmosphere_id, item.accent_id]);
    try { assert.equal((await alice.call(url, 'POST')).status, 422); }
    finally { await pool.execute('INSERT INTO atmosphere_accents VALUES (?, ?)', [item.atmosphere_id, item.accent_id]); }
  });
};
