'use strict';
const { request, send, session, money, node } = Fragrance;
const byId = id => document.getElementById(id);
const statuses = { new: 'Новый', processing: 'В работе', completed: 'Завершён', cancelled: 'Отменён' };
let registering = false;
let user;
let basket;
let checkoutKey;
let basketBusy = false;

function report(target, error) {
  byId(target).textContent = error.message || 'Не удалось выполнить действие. Проверьте соединение.';
  if (error.status === 401) {
    byId('auth-section').hidden = false; byId('customer-section').hidden = true;
    byId('page-status').textContent = 'Сессия завершилась. Войдите снова.';
  }
}
function authMode(value) {
  registering = value;
  byId('register-name-label').hidden = !value;
  byId('register-name').required = value;
  byId('password-help').hidden = !value;
  byId('auth-password').autocomplete = value ? 'new-password' : 'current-password';
  byId('auth-submit').textContent = value ? 'Зарегистрироваться' : 'Войти';
  byId('login-tab').setAttribute('aria-pressed', String(!value));
  byId('register-tab').setAttribute('aria-pressed', String(value));
  byId('auth-status').textContent = '';
}
async function load() {
  byId('reload-account').hidden = true;
  try {
    ({ user } = await session());
    byId('admin-link').hidden = user?.role !== 'admin';
    byId('auth-section').hidden = !!user; byId('customer-section').hidden = !user;
    byId('page-status').textContent = '';
    if (!user) return;
    byId('greeting').textContent = `Здравствуйте, ${user.name}`;
    byId('profile-email').textContent = user.email;
    byId('profile-name').value = byId('checkout-name').value = user.name;
    byId('profile-phone').value = byId('checkout-phone').value = user.phone;
    await Promise.all([loadCart(), loadOrders()]);
  } catch (error) { report('page-status', error); byId('reload-account').hidden = false; }
}
async function loadCart() {
  byId('cart-status').textContent = 'Загружаем корзину…';
  basket = await request('/api/cart');
  checkoutKey = crypto.randomUUID();
  // Reuse a key after a lost response so retrying cannot duplicate an order.
  try {
    const saved = JSON.parse(sessionStorage.getItem('fragrance.checkout') || 'null');
    if (saved?.revision === basket.revision && saved?.userId === user.id) checkoutKey = saved.key;
    sessionStorage.setItem('fragrance.checkout', JSON.stringify({ revision: basket.revision, userId: user.id, key: checkoutKey }));
  } catch { /* In-memory key still protects retries during this visit. */ }
  renderCart();
}
function renderCart() {
  const list = byId('cart-items'); list.replaceChildren();
  byId('cart-status').textContent = basket.items.length ? '' : 'Корзина пока пуста. Создайте свой первый аромат.';
  for (const item of basket.items) {
    const row = node('article', undefined, 'cart-row'); row.append(node('h3', item.name));
    if (item.quote) {
      const q = item.quote;
      row.append(node('p', `${q.atmosphere.title} · ${q.accent.name} · ${q.bottle.name}, ${q.bottle.volumeMl} мл`),
        node('p', `${money(q.totalMinor)} × ${item.quantity} = ${money(q.totalMinor * item.quantity)}`));
    } else row.append(node('p', item.error));
    const controls = node('div', undefined, 'cart-controls');
    const label = node('label', 'Количество'); const input = node('input');
    input.type = 'number'; input.min = '1'; input.max = '20'; input.value = item.quantity; input.className = 'quantity-input';
    label.append(input);
    const update = node('button', 'Обновить', 'secondary-button');
    const remove = node('button', 'Удалить', 'text-button');
    update.addEventListener('click', () => mutateCart(`/api/cart/${item.id}`, 'PATCH', { quantity: Number(input.value) }));
    remove.addEventListener('click', () => mutateCart(`/api/cart/${item.id}`, 'DELETE'));
    controls.append(label, update, remove); row.append(controls); list.append(row);
  }
  byId('cart-total').textContent = basket.items.length ? `${basket.canCheckout ? 'Итого' : 'Сумма доступных позиций'}: ${money(basket.totalMinor)}` : '';
  byId('checkout-form').hidden = !basket.items.length;
  byId('checkout-button').disabled = !basket.canCheckout || basketBusy;
  if (basket.items.length && !basket.canCheckout) byId('cart-status').textContent = 'Удалите недоступные позиции, чтобы оформить заказ.';
}
async function mutateCart(url, method, data) {
  if (basketBusy) return;
  basketBusy = true; byId('checkout-button').disabled = true;
  try { await send(url, method, data); await loadCart(); }
  catch (error) { report('cart-status', error); }
  finally { basketBusy = false; byId('checkout-button').disabled = !basket?.canCheckout; }
}
function orderDetails(order) {
  const content = node('div', undefined, 'order-details');
  content.append(node('p', `Получатель: ${order.customer_name}. Телефон: ${order.phone}.`));
  if (order.comment) content.append(node('p', `Комментарий: ${order.comment}`));
  const list = node('ul');
  for (const item of order.items) list.append(node('li', `${item.perfume_name}: ${item.atmosphere_title}, ${item.accent_name}; ${item.bottle_name}, ${item.volume_ml} мл. ${item.quantity} × ${money(item.unit_minor)}`));
  content.append(list); return content;
}
async function loadOrders() {
  const { orders } = await request('/api/orders');
  const list = byId('orders-list'); list.replaceChildren();
  byId('orders-status').textContent = orders.length ? '' : 'Оформленных заказов пока нет.';
  for (const order of orders) {
    const details = node('details', undefined, 'order-row');
    details.append(node('summary', `Заказ №${order.id} · ${statuses[order.status]} · ${money(order.total_minor)} · ${new Date(order.created_at).toLocaleDateString('ru-RU')}`));
    const body = node('div'); details.append(body); let loaded = false; let loading = false;
    details.addEventListener('toggle', async () => {
      if (!details.open || loaded || loading) return;
      loading = true; body.textContent = 'Загружаем состав…';
      try {
        const full = await request(`/api/orders/${order.id}`); body.replaceChildren(orderDetails(full)); loaded = true;
        if (full.status === 'new') {
          const cancel = node('button', 'Отменить заказ', 'secondary-button');
          cancel.addEventListener('click', async () => {
            cancel.disabled = true;
            try { await send(`/api/orders/${order.id}/cancel`, 'POST'); await loadOrders(); }
            catch (error) { report('orders-status', error); cancel.disabled = false; }
          });
          body.append(cancel);
        }
      } catch (error) { body.textContent = `${error.message} Закройте и откройте заказ, чтобы повторить.`; }
      finally { loading = false; }
    });
    list.append(details);
  }
}
byId('auth-form').addEventListener('submit', async event => {
  event.preventDefault(); byId('auth-submit').disabled = true; byId('auth-status').textContent = '';
  try {
    await send(`/api/auth/${registering ? 'register' : 'login'}`, 'POST', {
      name: byId('register-name').value, email: byId('auth-email').value, password: byId('auth-password').value,
    });
    byId('auth-password').value = '';
    if (new URLSearchParams(location.search).get('return') === 'constructor') { location.href = '/beginners.html?resume=1'; return; }
    if (new URLSearchParams(location.search).get('return') === 'admin') { location.href = '/admin.html'; return; }
    await load();
  } catch (error) { report('auth-status', error); }
  finally { byId('auth-submit').disabled = false; }
});
byId('profile-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try {
    const result = await send('/api/profile', 'PATCH', { name: byId('profile-name').value, phone: byId('profile-phone').value });
    user = result.user; byId('greeting').textContent = `Здравствуйте, ${user.name}`;
    byId('checkout-name').value = user.name; byId('checkout-phone').value = user.phone;
    byId('profile-status').textContent = 'Профиль сохранён.';
  } catch (error) { report('profile-status', error); }
  finally { button.disabled = false; }
});
byId('checkout-form').addEventListener('submit', async event => {
  event.preventDefault(); if (basketBusy || !basket?.canCheckout) return;
  basketBusy = true; byId('checkout-button').disabled = true; byId('checkout-status').textContent = '';
  try {
    const order = await send('/api/orders', 'POST', { name: byId('checkout-name').value, phone: byId('checkout-phone').value,
      comment: byId('checkout-comment').value, revision: basket.revision, checkoutKey });
    byId('page-status').textContent = `Заказ №${order.id} оформлен. Сумма: ${money(order.total_minor)}. Самовывоз, оплата при получении.`;
    byId('checkout-comment').value = '';
    await Promise.all([loadCart(), loadOrders()]);
  } catch (error) {
    report('checkout-status', error);
    if (error.status === 409 || error.status === 422) {
      try { await loadCart(); } catch (refreshError) { report('cart-status', refreshError); }
    }
  } finally { basketBusy = false; byId('checkout-button').disabled = !basket?.canCheckout; }
});
byId('logout').addEventListener('click', async () => {
  try { await send('/api/auth/logout', 'POST'); user = null; basket = null; byId('cart-items').replaceChildren(); byId('orders-list').replaceChildren(); await load(); }
  catch (error) { report('page-status', error); }
});
byId('login-tab').addEventListener('click', () => authMode(false));
byId('register-tab').addEventListener('click', () => authMode(true));
byId('reload-account').addEventListener('click', load);
load();
