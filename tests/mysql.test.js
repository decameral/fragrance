const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createPool } = require('../db/pool');
const { migrate } = require('../scripts/migrate');
const { quote } = require('../lib/quote');
const { createApp } = require('../server');

test('MySQL migration preserves catalogue, is repeatable, and supports quote API', { skip: !process.env.TEST_DB_NAME }, async t => {
  const database = process.env.TEST_DB_NAME;
  if (!/^fragrance_test_[a-z0-9_]+$/.test(database) || database === process.env.DB_NAME) {
    throw new Error('Use a separate fragrance_test_* database');
  }
  const admin = createPool({ database: undefined });
  const [[existing]] = await admin.execute('SELECT COUNT(*) AS n FROM information_schema.schemata WHERE schema_name = ?', [database]);
  if (existing.n) { await admin.end(); throw new Error('Test database must not exist'); }
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
  const pool = createPool({ database });
  t.after(async () => { await pool.end(); await admin.end(); });
  // Retain the isolated database for inspection; never delete an existing DB.
  const source = await fs.readFile(path.join(__dirname, '../db/perfume_database.sql'), 'utf8');
  const seed = source.replace(/CREATE DATABASE[\s\S]*?;/i, '').replace(/USE scent_craft_db;/g, '').replace(/--[^\n]*/g, '');
  for (const statement of seed.split(';').map(s => s.trim()).filter(Boolean)) await pool.query(statement);
  const [before] = await pool.query('SELECT id, title, base_accord FROM atmospheres ORDER BY id');
  await migrate(pool); await migrate(pool);
  const [after] = await pool.query('SELECT id, title, base_accord FROM atmospheres ORDER BY id');
  assert.deepEqual(after, before);
  const [[bottles]] = await pool.query('SELECT COUNT(*) AS n FROM bottles');
  assert.equal(bottles.n, 6);
  const selection = { atmosphereId: 'pine_forest', accentId: 'mint', bottleId: 1, totalMinor: 0 };
  assert.equal((await quote(pool, selection)).totalMinor, 6100);
  await assert.rejects(quote(pool, { ...selection, accentId: 'vanilla' }), { status: 422 });
  await pool.query('UPDATE bottles SET active = FALSE WHERE id = 1');
  await assert.rejects(quote(pool, selection), { status: 422 });
  await pool.query('UPDATE bottles SET active = TRUE WHERE id = 1');
  const server = createApp(pool, { sessionSecret: require('node:crypto').randomBytes(32).toString('hex') }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const catalogue = await (await fetch(`${base}/api/atmospheres`)).json();
  assert.equal(catalogue.length, 4);
  assert.equal(catalogue.find(a => a.id === 'pine_forest').accents.length, 4);
  const response = await fetch(`${base}/api/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selection) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).totalMinor, 6100);

  function client() {
    let cookie = ''; let token = '';
    return {
      async call(url, method = 'GET', body, csrf = true) {
        const response = await fetch(base + url, { method, headers: { Cookie: cookie,
          ...(method === 'GET' ? {} : { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': token } : {}) }) },
          ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }) });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        const data = await response.json();
        if (data.csrfToken) token = data.csrfToken;
        return { status: response.status, data, cookieAttributes: setCookie || '' };
      },
    };
  }
  const alice = client(); const bob = client(); const anonymous = client();
  const password = require('node:crypto').randomBytes(18).toString('hex');
  await t.test('registration, CSRF, password hashing and access boundaries', async () => {
    assert.equal((await anonymous.call('/api/cart')).status, 401);
    const initial = await alice.call('/api/auth/me');
    assert.match(initial.cookieAttributes, /HttpOnly/i);
    assert.match(initial.cookieAttributes, /SameSite=Lax/i);
    const details = { name: 'Тестовый покупатель', email: 'alice@example.test', password, role: 'admin' };
    assert.equal((await alice.call('/api/auth/register', 'POST', details, false)).status, 403);
    assert.equal((await alice.call('/api/auth/register', 'POST', details)).status, 201);
    const me = (await alice.call('/api/auth/me')).data;
    assert.equal(me.user.role, 'customer');
    const [[saved]] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [me.user.id]);
    assert.notEqual(saved.password_hash, password);
    assert.equal(await require('bcryptjs').compare(password, saved.password_hash), true);
    await bob.call('/api/auth/me');
    assert.equal((await bob.call('/api/auth/register', 'POST', details)).status, 409);
    assert.equal((await bob.call('/api/auth/register', 'POST', { ...details, email: 'bob@example.test' })).status, 201);
    assert.equal((await alice.call('/api/profile', 'PATCH', { name: 'Покупатель', phone: '+375 29 000 00 00' })).status, 200);
  });
  const item = { ...selection, name: '<b>Лес</b>', quantity: 2 };
  await t.test('cart validates components, quantity and ownership', async () => {
    assert.equal((await alice.call('/api/cart', 'POST', { ...item, quantity: 0 })).status, 400);
    assert.equal((await alice.call('/api/cart', 'POST', { ...item, accentId: 'vanilla' })).status, 422);
    const added = await alice.call('/api/cart', 'POST', item);
    assert.equal(added.status, 201);
    assert.equal(added.data.totalMinor, 12200);
    const id = added.data.items[0].id;
    assert.equal((await bob.call(`/api/cart/${id}`, 'PATCH', { quantity: 3 })).status, 404);
    assert.equal((await bob.call(`/api/cart/${id}`, 'DELETE')).status, 404);
    assert.equal((await alice.call(`/api/cart/${id}`, 'PATCH', { quantity: 3 })).data.totalMinor, 18300);
    assert.equal((await bob.call('/api/cart')).data.items.length, 0);
  });
  let orderId;
  const contact = { name: 'Тестовый покупатель', phone: '+375 29 000 00 00', comment: 'Тестовый заказ' };
  await t.test('checkout detects changed prices and concurrent retries create one order', async () => {
    const old = (await alice.call('/api/cart')).data;
    await pool.query('UPDATE bottles SET price = price + 1 WHERE id = 1');
    const payload = { ...contact, revision: old.revision, checkoutKey: require('node:crypto').randomUUID(), totalMinor: 1, userId: 2 };
    assert.equal((await alice.call('/api/orders', 'POST', payload)).status, 409);
    const fresh = (await alice.call('/api/cart')).data;
    assert.equal(fresh.items.length, 1);
    payload.revision = fresh.revision;
    const responses = await Promise.all([alice.call('/api/orders', 'POST', payload), alice.call('/api/orders', 'POST', payload)]);
    assert.deepEqual(responses.map(r => r.status), [201, 201]);
    assert.equal(responses[0].data.id, responses[1].data.id);
    orderId = responses[0].data.id;
    assert.equal(responses[0].data.total_minor, 18600);
    assert.equal((await alice.call('/api/cart')).data.items.length, 0);
    assert.equal((await alice.call('/api/orders')).data.orders.length, 1);
    assert.equal((await bob.call(`/api/orders/${orderId}`)).status, 404);
    assert.equal((await bob.call(`/api/orders/${orderId}/cancel`, 'POST')).status, 409);
    await pool.query('UPDATE bottles SET price = price + 10 WHERE id = 1');
    const snapshot = (await alice.call(`/api/orders/${orderId}`)).data;
    assert.equal(snapshot.total_minor, 18600);
    assert.equal(snapshot.items[0].unit_minor, 6200);
    assert.equal(snapshot.items[0].perfume_name, '<b>Лес</b>');
    assert.equal((await alice.call(`/api/orders/${orderId}/cancel`, 'POST')).status, 200);
    assert.equal((await alice.call(`/api/orders/${orderId}/cancel`, 'POST')).status, 409);
  });
  await t.test('failed order item insert rolls back the order and keeps the cart', async () => {
    await alice.call('/api/cart', 'POST', item);
    const current = (await alice.call('/api/cart')).data;
    await pool.query("CREATE TRIGGER fail_order_item BEFORE INSERT ON order_items FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'injected test failure'");
    try {
      const result = await alice.call('/api/orders', 'POST', { ...contact, revision: current.revision, checkoutKey: require('node:crypto').randomUUID() });
      assert.equal(result.status, 500);
      assert.doesNotMatch(result.data.error, /injected|SQL/);
      assert.equal((await alice.call('/api/cart')).data.items.length, 1);
      assert.equal((await alice.call('/api/orders')).data.orders.length, 1);
    } finally { await pool.query('DROP TRIGGER fail_order_item'); }
    const id = current.items[0].id;
    assert.equal((await alice.call(`/api/cart/${id}`, 'DELETE')).status, 200);
    assert.equal((await alice.call('/api/cart')).data.items.length, 0);
  });
  await t.test('logout invalidates access and login restores only the owner account', async () => {
    assert.equal((await alice.call('/api/auth/logout', 'POST')).status, 200);
    assert.equal((await alice.call('/api/orders')).status, 401);
    await alice.call('/api/auth/me');
    assert.equal((await alice.call('/api/auth/login', 'POST', { email: 'alice@example.test', password: 'incorrect' })).status, 401);
    assert.equal((await alice.call('/api/auth/login', 'POST', { email: 'alice@example.test', password })).status, 200);
    assert.equal((await alice.call('/api/orders')).data.orders.length, 1);
  });
  await require('./admin-workflow')(t, { pool, client, alice, bob, anonymous, password, base });
  await require('./storage-workflow')(t, pool);
  await require('./repeat-workflow')(t, { pool, alice, bob, anonymous });
});
