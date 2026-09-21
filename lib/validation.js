const { InputError } = require('./quote');
function text(value, label, max, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max || /[\u0000-\u001f]/u.test(value)) {
    throw new InputError(`${label}: допустимо от ${min} до ${max} символов.`);
  }
  return value.trim();
}
function phone(value) {
  const result = text(value, 'Телефон', 30, 7);
  if (!/^[+\d() -]+$/.test(result) || result.replace(/\D/g, '').length < 7) throw new InputError('Укажите корректный телефон.');
  return result;
}
function id(value) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new InputError('Некорректный идентификатор.');
  return Number(value);
}
function quantity(value) {
  if (!Number.isInteger(value) || value < 1 || value > 20) throw new InputError('Количество должно быть от 1 до 20.');
  return value;
}
module.exports = { text, phone, id, quantity };
