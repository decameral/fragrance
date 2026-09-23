const assert = require('node:assert/strict');
const { csv } = require('../lib/statistics');
module.exports = async function completionTests(t, { pool, alice, anonymous }) {
  const user = (await alice.call('/api/auth/me')).data.user;
  const period = '?from=2020-01-01&to=2099-12-31';
  await t.test('statistics and exchange require admin; report agrees with SQL and has empty state', async () => {
    assert.equal((await anonymous.call('/api/admin/statistics' + period)).status, 401);
    assert.equal((await alice.call('/api/admin/exchange')).status, 403);
    await pool.execute("UPDATE users SET role = 'admin' WHERE id = ?", [user.id]);
    const report = await alice.call('/api/admin/statistics' + period);
    assert.equal(report.status, 200);
    const [[expected]] = await pool.query("SELECT COUNT(*) AS count, SUM(IF(status='completed',total_minor,0)) AS total FROM orders");
    assert.equal(report.data.totalOrders, expected.count);
    assert.equal(report.data.completedMinor, Number(expected.total));
    const [[bottles]] = await pool.query("SELECT SUM(i.quantity) AS n FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.status='completed'");
    assert.equal(report.data.popular.reduce((sum, row) => sum + row.quantity, 0), Number(bottles.n));
    const empty = await alice.call('/api/admin/statistics?from=2000-01-01&to=2000-01-02');
    assert.equal(empty.data.totalOrders, 0); assert.equal(empty.data.completedMinor, 0); assert.deepEqual(empty.data.popular, []);
    for (const query of ['?from=2026-02-30&to=2026-03-01', '?from=2026-02-01&to=2026-01-01', '']) assert.equal((await alice.call('/api/admin/statistics' + query)).status, 400);
    const output = csv(report.data); assert.ok(output.startsWith('\ufeff')); assert.match(output, /Сумма завершённых/);
    const downloaded = await alice.call('/api/admin/report.csv' + period);
    assert.equal(downloaded.status, 200); assert.equal(downloaded.data, output.replace(/^\ufeff/, ''));
    assert.ok(csv({ ...report.data, popular: [{ atmosphere_id: 'test', title: '=1+1', quantity: 1 }] }).includes("'=1+1"));
  });
  await t.test('statistics includes the entire final day and excludes other dates', async () => {
    const [[order]] = await pool.query("SELECT id, created_at, total_minor FROM orders WHERE status='completed' LIMIT 1");
    await pool.execute("UPDATE orders SET created_at='2001-02-03 23:59:59' WHERE id=?", [order.id]);
    try {
      const result = (await alice.call('/api/admin/statistics?from=2001-02-03&to=2001-02-03')).data;
      assert.equal(result.totalOrders, 1); assert.equal(result.completedMinor, order.total_minor);
      assert.equal((await alice.call('/api/admin/statistics?from=2001-02-02&to=2001-02-02')).data.totalOrders, 0);
    } finally { await pool.execute('UPDATE orders SET created_at=? WHERE id=?', [order.created_at, order.id]); }
  });
  await t.test('catalog export/import roundtrip preserves data and rejects unsafe files', async () => {
    const original = (await alice.call('/api/admin/exchange')).data;
    assert.deepEqual(Object.keys(original).sort(), ['version', 'atmospheres', 'accents', 'bottles', 'compatibility'].sort());
    assert.equal((await alice.call('/api/admin/exchange', 'POST', original, false)).status, 403);
    assert.equal((await alice.call('/api/admin/exchange', 'POST', original)).status, 200);
    assert.deepEqual((await alice.call('/api/admin/exchange')).data, original);
    const [snapshots] = await pool.query('SELECT * FROM order_items ORDER BY id');
    const invalid = [null, { ...original, version: 2 }, { ...original, users: [] },
      { ...original, accents: [...original.accents, original.accents[0]] },
      { ...original, compatibility: [{ atmosphere_id: 'missing', accent_id: original.accents[0].id }] },
      { ...original, bottles: [{ ...original.bottles[0], id: 999999999999 }] }];
    for (const data of invalid) assert.equal((await alice.call('/api/admin/exchange', 'POST', data)).status, 400);
    assert.equal((await alice.call('/api/admin/exchange', 'POST', { padding: 'x'.repeat(1024 * 1024) })).status, 413);
    const change = structuredClone(original); change.atmospheres[0].title = 'Обновление из файла';
    assert.equal((await alice.call('/api/admin/exchange', 'POST', change)).status, 200);
    assert.equal((await alice.call('/api/admin/exchange')).data.atmospheres[0].title, 'Обновление из файла');
    assert.equal((await alice.call('/api/admin/exchange', 'POST', original)).status, 200);
    const conflict = structuredClone(original); conflict.atmospheres[0].title = 'Не должно сохраниться';
    conflict.bottles.push({ ...conflict.bottles[0], id: 12345 });
    assert.equal((await alice.call('/api/admin/exchange', 'POST', conflict)).status, 409);
    assert.deepEqual((await alice.call('/api/admin/exchange')).data, original);
    const additions = { version: 1, atmospheres: [], bottles: [], compatibility: [], accents: [{ ...original.accents[0], id: 'import_new_note', name: 'Новая нота' }] };
    assert.equal((await alice.call('/api/admin/exchange', 'POST', additions)).status, 200);
    assert.equal((await alice.call('/api/admin/exchange')).data.accents.length, original.accents.length + 1);
    assert.deepEqual((await pool.query('SELECT * FROM order_items ORDER BY id'))[0], snapshots);
  });
  await pool.execute("UPDATE users SET role = 'customer' WHERE id = ?", [user.id]);
};
