'use strict';
(() => {
  const { request, send, money, node } = Fragrance;
  const field = id => document.getElementById(id);
  const today = new Date();
  const date = value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  field('statistics-from').value = date(new Date(today.getFullYear(), today.getMonth(), 1));
  field('statistics-to').value = date(today);
  function period() {
    const from = field('statistics-from').value; const to = field('statistics-to').value;
    if (!from || !to || from > to) throw new Error('Укажите корректные начало и конец периода.');
    return new URLSearchParams({ from, to });
  }
  function table(headers, rows) {
    const result = node('table'); result.className = 'report-table';
    const head = node('thead'); const tr = node('tr');
    headers.forEach(title => { const th = node('th', title); th.scope = 'col'; tr.append(th); }); head.append(tr);
    const body = node('tbody'); rows.forEach(row => { const tr = node('tr'); row.forEach(value => tr.append(node('td', value))); body.append(tr); });
    result.append(head, body); return result;
  }
  async function download(url, filename) {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Не удалось скачать файл.'); }
    const objectUrl = URL.createObjectURL(await response.blob()); const link = node('a');
    link.href = objectUrl; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
  field('statistics-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.submitter; button.disabled = true;
    field('statistics-result').replaceChildren(); field('statistics-status').textContent = 'Считаем показатели…';
    try {
      const data = await request(`/api/admin/statistics?${period()}`);
      field('statistics-status').textContent = data.totalOrders ? `За период ${data.from} — ${data.to}` : 'За выбранный период заказов нет.';
      field('statistics-result').append(node('p', `Всего заказов: ${data.totalOrders}. Сумма завершённых: ${money(data.completedMinor)}.`),
        table(['Статус', 'Заказов'], data.statuses.map(row => [row.title, row.count])), node('h3', 'Популярные атмосферы'),
        data.popular.length ? table(['Атмосфера', 'Флаконов'], data.popular.map(row => [row.title, row.quantity])) : node('p', 'Нет завершённых заказов для рейтинга.'));
    } catch (error) { field('statistics-status').textContent = error.message; }
    finally { button.disabled = false; }
  });
  for (const [id, status, url, filename] of [
    ['download-report', 'statistics-status', () => `/api/admin/report.csv?${period()}`, 'fragrance-report.csv'],
    ['export-catalog', 'exchange-status', () => '/api/admin/exchange', 'fragrance-catalog.json'],
  ]) field(id).addEventListener('click', async event => {
    const button = event.currentTarget; button.disabled = true; field(status).textContent = 'Готовим файл…';
    try { await download(url(), filename); field(status).textContent = 'Файл передан браузеру для скачивания.'; }
    catch (error) { field(status).textContent = error.message; }
    finally { button.disabled = false; }
  });
  field('import-file').addEventListener('change', () => { field('import-confirm').checked = false; field('exchange-status').textContent = ''; });
  field('import-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.submitter; button.disabled = true;
    field('exchange-status').textContent = 'Проверяем файл…';
    try {
      const file = field('import-file').files[0];
      if (!file || file.size > 1024 * 1024) throw new Error('Выберите JSON-файл размером не более 1 МБ.');
      let data; try { data = JSON.parse(await file.text()); } catch { throw new Error('Файл не содержит корректный JSON.'); }
      const result = await send('/api/admin/exchange', 'POST', data);
      field('exchange-status').textContent = `Каталог сохранён: атмосфер — ${result.counts.atmospheres}, нот — ${result.counts.accents}, флаконов — ${result.counts.bottles}.`;
      field('import-form').reset(); closePanels(); await loadList();
    } catch (error) { field('exchange-status').textContent = error.message; }
    finally { button.disabled = false; }
  });
})();
