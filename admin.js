'use strict';
const { request, send, session, money, node } = Fragrance;
const $ = id => document.getElementById(id);
const names = { atmospheres: 'Атмосферы', accents: 'Акцентные ноты', bottles: 'Флаконы', orders: 'Заказы' };
const statuses = { new: 'Новый', processing: 'В работе', completed: 'Завершён', cancelled: 'Отменён' };
let kind = 'atmospheres'; let page = 1; let pages = 1; let sequence = 0;
let editing; let compatibilityId; let selectedOrder; let imageOptions = []; let orderRequest = 0;
function errorAt(id, error) {
  $(id).textContent = error.message || 'Не удалось выполнить запрос. Повторите попытку.';
  if (error.status === 401 || error.status === 403) {
    $('admin-content').hidden = true; $('admin-login').hidden = false; $('admin-retry').hidden = false;
    $('admin-status').textContent = error.message;
  }
}
function button(label, handler, className = 'secondary-button') {
  const result = node('button', label, className); result.type = 'button';
  result.addEventListener('click', handler); return result;
}
function option(select, value, label) { const item = node('option', label); item.value = value; select.append(item); }
function closePanels() { orderRequest++; compatibilityId = undefined; for (const id of ['editor', 'compatibility', 'order-detail']) $(id).hidden = true; }
function reveal(id) { $(id).hidden = false; $(id).scrollIntoView({ behavior: 'smooth', block: 'start' }); }
async function start() {
  $('admin-retry').hidden = true; $('admin-login').hidden = true;
  try {
    const { user } = await session();
    if (user?.role !== 'admin') {
      $('admin-content').hidden = true; $('admin-login').hidden = false;
      $('admin-status').textContent = user ? 'Этот аккаунт не имеет прав администратора.' : 'Войдите в аккаунт администратора.'; return;
    }
    imageOptions = (await request('/api/admin/images')).images;
    $('admin-status').textContent = `Администратор: ${user.name}`;
    $('admin-content').hidden = false; await loadList();
  } catch (error) { errorAt('admin-status', error); $('admin-retry').hidden = false; }
}
async function loadList() {
  const serial = ++sequence; const currentKind = kind;
  $('list-status').textContent = 'Загружаем…'; $('records').replaceChildren();
  $('previous-page').disabled = true; $('next-page').disabled = true;
  const params = new URLSearchParams({ page });
  let url;
  if (kind === 'orders') {
    for (const [key, field] of [['number', 'order-number'], ['status', 'order-status'], ['from', 'order-from'], ['to', 'order-to']]) if ($(field).value) params.set(key, $(field).value);
    url = '/api/admin/orders';
  } else {
    const [sort, direction] = $('catalog-order').value.split(':');
    params.set('q', $('catalog-query').value); params.set('state', $('catalog-state').value); params.set('sort', sort); params.set('direction', direction);
    url = `/api/admin/catalog/${kind}`;
  }
  try {
    const data = await request(`${url}?${params}`);
    if (serial !== sequence) return;
    if (page > data.pages) { page = data.pages; return loadList(); }
    pages = data.pages;
    $('list-status').textContent = data.total ? `Найдено: ${data.total}` : 'По выбранным условиям ничего не найдено.';
    for (const record of data.items) $('records').append(currentKind === 'orders' ? orderRow(record) : catalogRow(record, currentKind));
    $('page-label').textContent = `Страница ${page} из ${pages}`;
    $('previous-page').disabled = page <= 1; $('next-page').disabled = page >= pages;
  } catch (error) { if (serial === sequence) errorAt('list-status', error); }
}
function catalogRow(record, recordKind) {
  const row = node('article', undefined, 'admin-record'); const info = node('div');
  info.append(node('h3', record.title || record.name), node('span', record.active ? 'Доступно' : 'Скрыто', `visibility-badge${record.active ? '' : ' hidden-record'}`));
  const price = recordKind === 'bottles' ? record.price : record.price_per_ml;
  info.append(node('p', `Код: ${record.id} · ${money(Math.round(Number(price) * 100))}${recordKind === 'bottles' ? ` · ${record.volume_ml} мл` : ' / мл'}`));
  const actions = node('div', undefined, 'admin-actions');
  actions.append(button('Изменить', () => edit(record, recordKind)));
  if (recordKind === 'atmospheres') actions.append(button('Совместимость', () => openCompatibility(record.id)));
  actions.append(button(record.active ? 'Скрыть' : 'Показать', async event => {
    event.currentTarget.disabled = true;
    try { await send(`/api/admin/catalog/${recordKind}/${encodeURIComponent(record.id)}/visibility`, 'PATCH', { active: !record.active }); await loadList(); }
    catch (error) { errorAt('list-status', error); event.target.disabled = false; }
  }));
  const remove = button('Удалить', () => {
    remove.hidden = true;
    const confirm = button('Удалить окончательно', async event => {
      event.currentTarget.disabled = true;
      try { await send(`/api/admin/catalog/${recordKind}/${encodeURIComponent(record.id)}`, 'DELETE'); await loadList(); }
      catch (error) { errorAt('list-status', error); event.target.disabled = false; }
    });
    const cancel = button('Отмена', () => { confirm.remove(); cancel.remove(); remove.hidden = false; }, 'text-button');
    actions.append(confirm, cancel);
  }, 'text-button');
  actions.append(remove); row.append(info, actions); return row;
}
function field(name, title, value = '', type = 'text', max = 255) {
  const label = node('label', title); const input = node(type === 'textarea' ? 'textarea' : 'input');
  input.name = name; if (type !== 'textarea') input.type = type;
  input.maxLength = max; input.required = true; input.value = value;
  if (type === 'textarea') input.rows = 3;
  label.append(input); $('editor-fields').append(label); return input;
}
function edit(record, recordKind = kind) {
  closePanels(); editing = { kind: recordKind, id: record?.id }; $('editor-fields').replaceChildren();
  $('editor-title').textContent = `${record ? 'Изменить' : 'Добавить'}: ${names[recordKind].toLowerCase()}`;
  $('editor-status').textContent = '';
  if (recordKind !== 'bottles') {
    const input = field('id', 'Уникальный код (латиница, цифры, дефис)', record?.id || '', 'text', 50); input.readOnly = !!record;
  }
  field(recordKind === 'atmospheres' ? 'title' : 'name', 'Название', record?.title || record?.name || '', 'text', recordKind === 'atmospheres' ? 255 : 100);
  if (recordKind === 'atmospheres') {
    field('subtitle', 'Краткое описание', record?.subtitle || '');
    const label = node('label', 'Изображение'); const select = node('select'); select.name = 'image'; select.required = true;
    option(select, '', 'Выберите изображение'); imageOptions.forEach(image => option(select, image, image.replace('images/', ''))); select.value = record?.image || '';
    label.append(select); $('editor-fields').append(label);
    let accords = record?.base_accord || []; if (typeof accords === 'string') accords = JSON.parse(accords);
    field('base_accord', 'Базовые ноты (по одной на строку или через запятую)', accords.join('\n'), 'textarea', 800);
  }
  if (recordKind === 'accents') field('category', 'Категория', record?.category || '', 'text', 50);
  if (recordKind !== 'bottles') field('description', 'Описание', record?.description || '', 'textarea', 4000);
  else { const volume = field('volume_ml', 'Объём, мл', record?.volume_ml || 30, 'number'); volume.min = '1'; volume.max = '1000'; volume.step = '1'; }
  const cost = field(recordKind === 'bottles' ? 'price' : 'price_per_ml', recordKind === 'bottles' ? 'Цена флакона, BYN' : 'Цена за мл, BYN', record?.price ?? record?.price_per_ml ?? '0.00'); cost.inputMode = 'decimal';
  const label = node('label', 'Доступно покупателям', 'checkbox-label'); const check = node('input'); check.type = 'checkbox'; check.name = 'active'; check.checked = record ? !!record.active : true;
  label.prepend(check); $('editor-fields').append(label); reveal('editor');
}
$('record-form').addEventListener('submit', async event => {
  event.preventDefault(); const submit = event.submitter; submit.disabled = true;
  const target = editing; const form = event.currentTarget; const body = Object.fromEntries(new FormData(form));
  body.active = !!form.elements.active.checked;
  if (target.kind === 'bottles') { body.volume_ml = Number(body.volume_ml); body.price = body.price.replace(',', '.'); }
  else body.price_per_ml = body.price_per_ml.replace(',', '.');
  if (target.kind === 'atmospheres') body.base_accord = body.base_accord.split(/[,\n]/).map(value => value.trim()).filter(Boolean);
  try {
    const saved = await send(`/api/admin/catalog/${target.kind}${target.id === undefined ? '' : '/' + encodeURIComponent(target.id)}`, target.id === undefined ? 'POST' : 'PUT', body);
    if (editing === target) {
      editing = { ...target, id: saved.id };
      $('editor-title').textContent = `Изменить: ${names[target.kind].toLowerCase()}`;
      if (form.elements.namedItem('id')) form.elements.namedItem('id').readOnly = true;
      $('editor-status').textContent = 'Позиция сохранена.';
    }
    await loadList();
  } catch (error) { errorAt('editor-status', error); }
  finally { submit.disabled = false; }
});
async function openCompatibility(id) {
  closePanels(); compatibilityId = id; $('compatibility-status').textContent = 'Загружаем…'; $('compatibility-options').replaceChildren(); reveal('compatibility');
  $('compatibility-form').querySelector('button').disabled = true;
  try {
    const data = await request(`/api/admin/atmospheres/${encodeURIComponent(id)}/accents`);
    if (compatibilityId !== id) return;
    $('compatibility-title').textContent = `Совместимость: ${data.atmosphere.title}`;
    for (const accent of data.accents) {
      const label = node('label', `${accent.name}${accent.active ? '' : ' (скрыта)'}`); const check = node('input');
      check.type = 'checkbox'; check.name = 'accent'; check.value = accent.id; check.checked = data.selectedIds.includes(accent.id); label.prepend(check); $('compatibility-options').append(label);
    }
    $('compatibility-status').textContent = data.accents.length ? '' : 'Сначала добавьте акцентные ноты.';
    $('compatibility-form').querySelector('button').disabled = false;
  } catch (error) { errorAt('compatibility-status', error); }
}
$('compatibility-form').addEventListener('submit', async event => {
  event.preventDefault(); const submit = event.submitter; submit.disabled = true;
  const accentIds = new FormData(event.currentTarget).getAll('accent');
  try { await send(`/api/admin/atmospheres/${encodeURIComponent(compatibilityId)}/accents`, 'PUT', { accentIds }); $('compatibility-status').textContent = 'Совместимость сохранена.'; }
  catch (error) { errorAt('compatibility-status', error); }
  finally { submit.disabled = false; }
});
function orderRow(order) {
  const row = node('article', undefined, 'admin-record'); const info = node('div');
  info.append(node('h3', `Заказ №${order.id} · ${statuses[order.status]}`), node('p', `${order.customer_name} · ${money(order.total_minor)} · ${new Date(order.created_at).toLocaleDateString('ru-RU')}`));
  row.append(info, button('Открыть заказ', () => openOrder(order.id))); return row;
}
async function openOrder(id) {
  closePanels(); selectedOrder = null; $('order-title').textContent = `Заказ №${id}`;
  const serial = orderRequest;
  $('order-body').replaceChildren(); $('order-message').textContent = 'Загружаем…'; $('change-status').hidden = true; reveal('order-detail');
  try {
    const order = await request(`/api/admin/orders/${id}`);
    if (serial !== orderRequest) return;
    selectedOrder = order;
    const body = $('order-body'); body.append(node('p', `Статус: ${statuses[order.status]}`), node('p', `Получатель: ${order.customer_name}`), node('p', `Телефон: ${order.phone}`), node('p', `Сумма: ${money(order.total_minor)}`));
    if (order.comment) body.append(node('p', `Комментарий: ${order.comment}`));
    const list = node('ul');
    order.items.forEach(item => list.append(node('li', `${item.perfume_name}: ${item.atmosphere_title}, ${item.accent_name}, ${item.bottle_name}, ${item.volume_ml} мл; ${item.quantity} × ${money(item.unit_minor)}`))); body.append(list);
    $('next-status').replaceChildren(); order.allowedStatuses.forEach(status => option($('next-status'), status, statuses[status]));
    $('change-status').hidden = !order.allowedStatuses.length;
    $('order-message').textContent = order.allowedStatuses.length ? '' : 'Этот заказ завершён или отменён. Изменение статуса недоступно.';
  } catch (error) { errorAt('order-message', error); }
}
$('change-status').addEventListener('submit', async event => {
  event.preventDefault(); const submit = event.submitter; submit.disabled = true;
  const order = selectedOrder;
  try {
    await send(`/api/admin/orders/${order.id}/status`, 'PATCH', { expectedStatus: order.status, status: $('next-status').value });
    await loadList(); await openOrder(order.id); $('order-message').textContent = 'Статус обновлён.';
  } catch (error) { errorAt('order-message', error); }
  finally { submit.disabled = false; }
});
document.querySelectorAll('[data-kind]').forEach(tab => tab.addEventListener('click', () => {
  kind = tab.dataset.kind; page = 1; closePanels();
  document.querySelectorAll('[data-kind]').forEach(item => item.setAttribute('aria-pressed', String(item === tab)));
  $('list-title').textContent = names[kind]; $('create-record').hidden = kind === 'orders';
  $('catalog-filters').hidden = kind === 'orders'; $('order-filters').hidden = kind !== 'orders'; loadList();
}));
for (const id of ['catalog-filters', 'order-filters']) $(id).addEventListener('submit', event => { event.preventDefault(); page = 1; loadList(); });
$('create-record').addEventListener('click', () => edit(null));
$('close-editor').addEventListener('click', () => { $('editor').hidden = true; });
$('close-compatibility').addEventListener('click', () => { $('compatibility').hidden = true; compatibilityId = undefined; });
$('close-order').addEventListener('click', () => { $('order-detail').hidden = true; orderRequest++; });
$('previous-page').addEventListener('click', () => { if (page > 1) { page--; loadList(); } });
$('next-page').addEventListener('click', () => { if (page < pages) { page++; loadList(); } });
$('admin-retry').addEventListener('click', start);
start();
