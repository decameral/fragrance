const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cents, quote } = require('../lib/quote');
const { createApp } = require('../server');

test('decimal prices are converted without floating point rounding', () => {
  assert.equal(cents('1.01'), 101);
  assert.equal(cents('0.29'), 29);
  for (const value of ['-1', 'NaN', '1.001', '1e3']) assert.throws(() => cents(value));
});
test('rejects invalid IDs before accessing the database', async () => {
  const pool = { execute() { assert.fail('Database must not be called'); } };
  for (const input of [null, [], {}, { atmosphereId: "' OR 1=1", accentId: 'mint', bottleId: 1 },
    { atmosphereId: 'forest', accentId: 'mint', bottleId: '1' }]) {
    await assert.rejects(quote(pool, input), { status: 400 });
  }
});
test('quote uses server prices and rejects incompatible or missing components', async () => {
  const input = { atmosphereId: 'forest', accentId: 'mint', bottleId: 1, totalMinor: 1 };
  const composition = { atmosphere_id: 'forest', atmosphere_title: 'Лес', accent_id: 'mint', accent_name: 'Мята', base_price: '1.50', accent_price: '0.20' };
  const bottle = { id: 1, name: 'Классический', volume_ml: 30, price: '10.00' };
  const pool = { execute: async sql => [[sql.includes('FROM atmospheres') ? composition : bottle]] };
  assert.equal((await quote(pool, input)).totalMinor, 6100);
  await assert.rejects(quote({ execute: async () => [[]] }, input), { status: 422 });
  await assert.rejects(quote({ execute: async sql => [sql.includes('FROM atmospheres') ? [composition] : []] }, input), { status: 422 });
});
test('HTTP validates input and does not publish private project files', async t => {
  const server = createApp({}).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(url)).status, 200);
  for (const file of ['.env', 'server.js', 'package.json', 'db/perfume_database.sql', 'AGENTS.md']) {
    assert.equal((await fetch(`${url}/${file}`)).status, 404);
  }
  const malformed = await fetch(`${url}/api/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error, 'Некорректный JSON.');
  const invalid = await fetch(`${url}/api/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(invalid.status, 400);
});
