window.Fragrance = (() => {
  let token;
  async function request(url, options = {}) {
    const method = options.method || 'GET';
    if (method !== 'GET' && !token) await session();
    const response = await fetch(url, { ...options, credentials: 'same-origin', headers: {
      ...(method !== 'GET' ? { 'Content-Type': 'application/json', 'X-CSRF-Token': token } : {}), ...options.headers,
    } });
    const body = await response.json();
    if (!response.ok) {
      if (response.status === 403) token = undefined;
      const error = new Error(body.error || 'Не удалось выполнить запрос.'); error.status = response.status; throw error;
    }
    if (body.csrfToken) token = body.csrfToken;
    return body;
  }
  async function session() { return request('/api/auth/me'); }
  function send(url, method, body = {}) { return request(url, { method, body: JSON.stringify(body) }); }
  const money = minor => new Intl.NumberFormat('ru-BY', { style: 'currency', currency: 'BYN' }).format(Number(minor) / 100);
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function orderHistory(events = []) {
    const section = node('section'); section.append(node('h3', 'История статусов'));
    const labels = { new: 'Новый', processing: 'В работе', completed: 'Завершён', cancelled: 'Отменён' };
    const list = node('ol');
    for (const event of events) {
      const status = labels[event.to_status] || event.to_status;
      const description = event.event_kind === 'migration' ? `Зафиксирован при переносе: ${status}`
        : event.event_kind === 'created' ? `Заказ создан: ${status}` : `${labels[event.from_status] || event.from_status} → ${status}`;
      list.append(node('li', `${new Date(event.changed_at).toLocaleString('ru-RU')} — ${description}`));
    }
    section.append(events.length ? list : node('p', 'Событий пока нет.'));
    return section;
  }
  return { request, session, send, money, node, orderHistory };
})();
