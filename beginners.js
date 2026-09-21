'use strict';
const $ = id => document.getElementById(id);
const state = { atmospheres: [], bottles: [], atmosphere: null, accentId: '', bottleId: 0, name: '', step: 0, quote: null, request: 0 };
const currency = minor => new Intl.NumberFormat('ru-BY', { style: 'currency', currency: 'BYN' }).format(minor / 100);
const draftKey = 'fragrance.composition.v1';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
async function api(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Не удалось загрузить данные. Попробуйте ещё раз.');
  return body;
}
function readDraft() {
  try { return JSON.parse(localStorage.getItem(draftKey)) || {}; } catch { return {}; }
}
function renderCatalogue() {
  const query = $('catalog-search').value.trim().toLocaleLowerCase('ru');
  const direction = $('catalog-sort').value === 'desc' ? -1 : 1;
  const items = state.atmospheres.filter(a => `${a.title} ${a.description}`.toLocaleLowerCase('ru').includes(query))
    .sort((a, b) => direction * a.title.localeCompare(b.title, 'ru'));
  $('atmospheres-grid').replaceChildren();
  $('catalog-status').textContent = items.length ? `Атмосфер: ${items.length}` : 'Ничего не найдено. Попробуйте изменить поиск.';
  for (const item of items) {
    const card = element('article', 'atmosphere-card');
    card.dataset.id = item.id;
    const img = element('img', 'atmosphere-image');
    if (typeof item.image === 'string' && /^images\/[\w./-]+$/.test(item.image)) img.src = item.image;
    img.alt = item.title;
    img.addEventListener('error', () => { img.hidden = true; });
    const tags = element('div', 'atmosphere-accords');
    let accords = item.base_accord;
    try { if (typeof accords === 'string') accords = JSON.parse(accords); } catch { accords = []; }
    for (const accord of Array.isArray(accords) ? accords : []) tags.append(element('span', 'tag', accord));
    const button = element('button', 'primary-button', 'Создать аромат');
    button.type = 'button';
    button.addEventListener('click', () => openConstructor(item));
    card.append(img, element('h3', 'atmosphere-title', item.title), element('p', 'atmosphere-subtitle', item.subtitle),
      element('p', 'atmosphere-description', item.description), tags, button);
    $('atmospheres-grid').append(card);
  }
}
async function loadCatalogue() {
  $('catalog-status').textContent = 'Загружаем атмосферы…';
  try {
    state.atmospheres = await api('/api/atmospheres');
    renderCatalogue();
  } catch {
    $('atmospheres-grid').replaceChildren();
    $('catalog-status').textContent = 'Не удалось загрузить каталог. Проверьте соединение и повторите попытку.';
    const retry = element('button', 'secondary-button', 'Повторить загрузку');
    retry.addEventListener('click', loadCatalogue);
    $('atmospheres-grid').append(retry);
  }
}
function choices(container, items, group, selected, label, onChange) {
  container.replaceChildren();
  for (const item of items) {
    const wrapper = element('label', 'choice-card');
    const input = document.createElement('input');
    input.type = 'radio'; input.name = group; input.value = item.id; input.checked = String(item.id) === String(selected);
    input.addEventListener('change', () => onChange(item.id));
    const copy = element('span', 'choice-copy');
    copy.append(element('strong', '', label(item)), element('span', '', item.description || ''));
    wrapper.append(input, copy); container.append(wrapper);
  }
}
async function openConstructor(atmosphere) {
  // Keep selections when returning to the same composition; discard incompatible accents.
  const draft = state.atmosphere ? { atmosphereId: state.atmosphere.id, accentId: state.accentId, bottleId: state.bottleId, name: state.name } : readDraft();
  state.atmosphere = atmosphere;
  state.accentId = atmosphere.accents.some(a => a.id === draft.accentId) ? draft.accentId : '';
  state.bottleId = Number.isSafeInteger(draft.bottleId) ? draft.bottleId : 0;
  state.name = typeof draft.name === 'string' ? draft.name.slice(0, 80) : '';
  state.quote = null; state.step = 0; state.request++;
  $('perfume-name').value = state.name;
  $('chosen-atmosphere').textContent = atmosphere.title;
  $('wizard-status').textContent = '';
  choices($('accent-options'), atmosphere.accents, 'accent', state.accentId, a => a.name, id => {
    state.accentId = id; refreshQuote();
  });
  if (!atmosphere.accents.length) $('wizard-status').textContent = 'Для этой атмосферы пока нет доступных акцентов.';
  renderStep();
  $('constructor-dialog').showModal();
  await loadBottles();
}
async function loadBottles() {
  $('bottle-options').textContent = 'Загружаем варианты флаконов…';
  try {
    state.bottles = await api('/api/bottles');
    if (!state.bottles.some(b => b.id === state.bottleId)) state.bottleId = 0;
    choices($('bottle-options'), state.bottles, 'bottle', state.bottleId,
      b => `${b.name} · ${b.volume_ml} мл`, id => { state.bottleId = id; refreshQuote(); });
    if (!state.bottles.length) $('bottle-options').textContent = 'Доступных флаконов пока нет.';
    await refreshQuote();
  } catch {
    state.bottles = []; state.bottleId = 0;
    $('bottle-options').textContent = 'Не удалось загрузить флаконы. ';
    const retry = element('button', 'secondary-button', 'Повторить');
    retry.type = 'button'; retry.addEventListener('click', loadBottles);
    $('bottle-options').append(retry);
    renderStep();
  }
}
function renderStep() {
  ['accent-step', 'bottle-step', 'name-step'].forEach((id, index) => { $(id).hidden = index !== state.step; });
  document.querySelectorAll('[data-step]').forEach(node => {
    if (Number(node.dataset.step) === state.step) node.setAttribute('aria-current', 'step');
    else node.removeAttribute('aria-current');
  });
  $('previous-step').disabled = state.step === 0;
  $('next-step').textContent = state.step === 2 ? 'Сохранить черновик' : 'Далее';
  $('next-step').disabled = state.step === 0 ? !state.accentId : !state.quote;
  $('quote-total').textContent = state.quote ? currency(state.quote.totalMinor) : 'Выберите параметры';
  const summary = $('composition-summary'); summary.replaceChildren();
  if (state.quote) {
    for (const [key, value] of [['Атмосфера', state.quote.atmosphere.title], ['Акцент', state.quote.accent.name],
      ['Флакон', `${state.quote.bottle.name}, ${state.quote.bottle.volumeMl} мл`]]) {
      summary.append(element('dt', '', key), element('dd', '', value));
    }
  }
}
async function refreshQuote() {
  const request = ++state.request;
  state.quote = null; $('wizard-status').textContent = ''; renderStep();
  if (!state.accentId || !state.bottleId) return;
  $('quote-total').textContent = 'Рассчитываем…';
  try {
    const result = await api('/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ atmosphereId: state.atmosphere.id, accentId: state.accentId, bottleId: state.bottleId }) });
    if (request !== state.request) return;
    state.quote = result; renderStep();
  } catch (error) {
    if (request !== state.request) return;
    $('wizard-status').textContent = error.message + ' ';
    const retry = element('button', 'text-button', 'Повторить расчёт');
    retry.type = 'button'; retry.addEventListener('click', refreshQuote);
    $('wizard-status').append(retry); renderStep();
  }
}
$('constructor-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (state.step === 0 && !state.accentId || state.step > 0 && !state.quote) return;
  if (state.step < 2) { state.step++; renderStep(); if (state.step === 2) $('perfume-name').focus(); return; }
  const name = $('perfume-name').value.trim();
  if (!name || name.length > 80) { $('wizard-status').textContent = 'Введите название от 1 до 80 символов.'; $('perfume-name').focus(); return; }
  try {
    localStorage.setItem(draftKey, JSON.stringify({ atmosphereId: state.atmosphere.id, accentId: state.accentId, bottleId: state.bottleId, name }));
    state.name = name;
    $('wizard-status').textContent = 'Черновик сохранён в этом браузере. Это ещё не заказ.';
  } catch { $('wizard-status').textContent = 'Браузер не разрешает сохранить черновик. Выбранные параметры останутся до закрытия страницы.'; }
});
$('perfume-name').addEventListener('input', () => { state.name = $('perfume-name').value; });
$('previous-step').addEventListener('click', () => { state.step = Math.max(0, state.step - 1); $('wizard-status').textContent = ''; renderStep(); });
$('close-constructor').addEventListener('click', () => $('constructor-dialog').close());
$('catalog-search').addEventListener('input', renderCatalogue);
$('catalog-sort').addEventListener('change', renderCatalogue);
loadCatalogue();
