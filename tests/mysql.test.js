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
  const server = createApp(pool).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const catalogue = await (await fetch(`${base}/api/atmospheres`)).json();
  assert.equal(catalogue.length, 4);
  assert.equal(catalogue.find(a => a.id === 'pine_forest').accents.length, 4);
  const response = await fetch(`${base}/api/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selection) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).totalMinor, 6100);
});
