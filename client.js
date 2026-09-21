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
  return { request, session, send, money, node };
})();
