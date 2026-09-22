const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { grantAdmin } = require('../scripts/grant-admin');

module.exports = async function adminWorkflow(t, { pool, client, alice, bob, anonymous, password, base }) {
  const operator = client();
  const atmosphere = { id: 'qa_atmosphere', title: 'Тестовая атмосфера', subtitle: 'Для проверки', description: 'Описание атмосферы',
    image: 'images/pine.png', base_accord: ['Хвоя', 'Мускус'], price_per_ml: '1.25', active: true };
  const accent = { id: 'qa_accent', name: 'Тестовая нота', category: 'Свежесть', description: 'Описание ноты', price_per_ml: '0.10', active: true };
  let bottleId; let orderId;
  await t.test('admin routes require role and CSRF; public registration cannot grant the role', async () => {
    assert.equal((await anonymous.call('/api/admin/orders')).status, 401);
    assert.equal((await alice.call('/api/admin/catalog/atmospheres')).status, 403);
    assert.equal((await alice.call('/api/admin/catalog/atmospheres', 'POST', atmosphere)).status, 403);
    await operator.call('/api/auth/me');
    assert.equal((await operator.call('/api/auth/register', 'POST', { name: 'Тестовый администратор', email: 'admin@example.test', password, role: 'admin' })).status, 201);
    assert.equal((await operator.call('/api/admin/orders')).status, 403);
    await grantAdmin(pool, 'admin@example.test');
    assert.equal((await operator.call('/api/admin/orders')).status, 200);
    assert.equal((await operator.call('/api/admin/catalog/atmospheres', 'POST', atmosphere, false)).status, 403);
  });
  await t.test('catalogue CRUD validates fields, identifiers, sorting and images', async () => {
    assert.equal((await operator.call('/api/admin/catalog/atmospheres', 'POST', { ...atmosphere, image: '../.env' })).status, 400);
    assert.equal((await operator.call('/api/admin/catalog/atmospheres', 'POST', { ...atmosphere, price_per_ml: '-2.00' })).status, 400);
    assert.equal((await operator.call('/api/admin/catalog/atmospheres', 'POST', atmosphere)).status, 201);
    assert.equal((await operator.call('/api/admin/catalog/atmospheres', 'POST', atmosphere)).status, 409);
    assert.equal((await operator.call('/api/admin/catalog/accents', 'POST', accent)).status, 201);
    const bottle = await operator.call('/api/admin/catalog/bottles', 'POST', { name: 'Тестовый флакон', volume_ml: 30, price: '5.00', active: true });
    assert.equal(bottle.status, 201); bottleId = bottle.data.id;
    assert.equal((await operator.call('/api/admin/catalog/bottles', 'POST', { name: 'Ошибка', volume_ml: 0, price: '1.00', active: true })).status, 400);
    assert.equal((await operator.call('/api/admin/catalog/atmospheres/qa_atmosphere', 'PUT', { ...atmosphere, title: 'Обновлённая атмосфера' })).status, 200);
    const list = await operator.call('/api/admin/catalog/atmospheres?q=qa_atmosphere&sort=price&direction=desc');
    assert.equal(list.data.total, 1); assert.equal(list.data.items[0].title, 'Обновлённая атмосфера');
    assert.equal((await operator.call('/api/admin/catalog/atmospheres?sort=title%3BDROP')).status, 400);
    assert.equal((await operator.call('/api/admin/catalog/users')).status, 404);
    assert.equal((await operator.call('/api/admin/catalog/atmospheres?page=0')).status, 400);
    assert.equal((await operator.call('/api/admin/catalog/accents', 'POST', { ...accent, id: 'qa_unused' })).status, 201);
    assert.equal((await operator.call('/api/admin/catalog/accents/qa_unused', 'DELETE')).status, 200);
  });
  const selection = () => ({ atmosphereId: atmosphere.id, accentId: accent.id, bottleId, name: 'Снимок аромата', quantity: 1 });
  await t.test('compatibility is atomic and hidden components cannot be quoted or ordered', async () => {
    const path = '/api/admin/atmospheres/qa_atmosphere/accents';
    assert.equal((await operator.call(path, 'PUT', { accentIds: [accent.id] })).status, 200);
    assert.equal((await operator.call(path, 'PUT', { accentIds: [accent.id, 'missing_note'] })).status, 422);
    assert.deepEqual((await operator.call(path)).data.selectedIds, [accent.id]);
    assert.equal((await bob.call('/api/cart', 'POST', selection())).status, 201);
    for (const [kind, id] of [['atmospheres', atmosphere.id], ['accents', accent.id], ['bottles', bottleId]]) {
      assert.equal((await operator.call(`/api/admin/catalog/${kind}/${id}/visibility`, 'PATCH', { active: false })).status, 200);
      const response = await fetch(base + '/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selection()) });
      assert.equal(response.status, 422);
      const basket = (await bob.call('/api/cart')).data; assert.equal(basket.canCheckout, false);
      assert.equal((await bob.call('/api/orders', 'POST', { name: 'Покупатель', phone: '+375 29 000 00 00', revision: basket.revision, checkoutKey: randomUUID() })).status, 422);
      if (kind === 'atmospheres') {
        const visible = await (await fetch(base + '/api/atmospheres')).json();
        assert.equal(visible.some(a => a.id === atmosphere.id), false);
        assert.equal((await operator.call('/api/admin/catalog/atmospheres?state=hidden')).data.items.some(a => a.id === atmosphere.id), true);
      }
      assert.equal((await operator.call(`/api/admin/catalog/${kind}/${id}/visibility`, 'PATCH', { active: true })).status, 200);
    }
    await operator.call(path, 'PUT', { accentIds: [] });
    assert.equal((await bob.call('/api/cart')).data.canCheckout, false);
    await operator.call(path, 'PUT', { accentIds: [accent.id] });
  });
  await t.test('admin order filters, status transitions and concurrent edits preserve history', async () => {
    const basket = (await bob.call('/api/cart')).data;
    const created = await bob.call('/api/orders', 'POST', { name: 'Покупатель', phone: '+375 29 000 00 00', revision: basket.revision, checkoutKey: randomUUID() });
    assert.equal(created.status, 201); orderId = created.data.id;
    const detail = await operator.call(`/api/admin/orders/${orderId}`);
    assert.equal(detail.status, 200); assert.equal(detail.data.total_minor, 4550);
    assert.equal((await operator.call(`/api/admin/orders?number=${orderId}&status=new`)).data.total, 1);
    assert.equal((await operator.call('/api/admin/orders?from=2026-02-30')).status, 400);
    assert.equal((await operator.call('/api/admin/orders?from=2026-09-23&to=2026-09-22')).status, 400);
    const change = `/api/admin/orders/${orderId}/status`;
    assert.equal((await operator.call(change, 'PATCH', { expectedStatus: 'new', status: 'completed' })).status, 422);
    assert.equal((await operator.call(change, 'PATCH', { expectedStatus: 'new', status: 'processing' })).status, 200);
    assert.equal((await bob.call(`/api/orders/${orderId}/cancel`, 'POST')).status, 409);
    assert.equal((await operator.call(change, 'PATCH', { expectedStatus: 'new', status: 'cancelled' })).status, 409);
    assert.equal((await operator.call(change, 'PATCH', { expectedStatus: 'processing', status: 'completed' })).status, 200);
    assert.equal((await operator.call(change, 'PATCH', { expectedStatus: 'completed', status: 'cancelled' })).status, 422);
    for (const [kind, id] of [['atmospheres', atmosphere.id], ['accents', accent.id], ['bottles', bottleId]]) {
      assert.equal((await operator.call(`/api/admin/catalog/${kind}/${id}`, 'DELETE')).status, 409);
      await operator.call(`/api/admin/catalog/${kind}/${id}/visibility`, 'PATCH', { active: false });
    }
    await operator.call('/api/admin/catalog/atmospheres/qa_atmosphere', 'PUT', { ...atmosphere, title: 'Позднее название', price_per_ml: '9.00', active: false });
    const history = (await bob.call(`/api/orders/${orderId}`)).data;
    assert.equal(history.items[0].atmosphere_title, 'Обновлённая атмосфера');
    assert.equal(history.total_minor, 4550);
    assert.equal(history.status, 'completed');
  });
  await t.test('revoked admin role takes effect in the existing session', async () => {
    await pool.execute("UPDATE users SET role = 'customer' WHERE email = ?", ['admin@example.test']);
    assert.equal((await operator.call('/api/admin/orders')).status, 403);
  });
};
