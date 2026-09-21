const fs = require('node:fs/promises');
const path = require('node:path');
const { createPool } = require('../db/pool');

async function migrate(pool) {
  const connection = await pool.getConnection();
  let locked = false;
  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK(CONCAT(DATABASE(), ':migrations'), 10) AS acquired");
    if (lock.acquired !== 1) throw new Error('Не удалось получить блокировку миграций');
    locked = true;
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(180) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
    const directory = path.join(__dirname, '../db/migrations');
    for (const file of (await fs.readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
      const sql = (await fs.readFile(path.join(directory, file), 'utf8')).replace(/^--.*$/gm, '');
      const statements = sql.split(';').map(statement => statement.trim()).filter(Boolean);
      for (const [index, statement] of statements.entries()) {
        const key = `${file}:${index + 1}`;
        const [done] = await connection.execute('SELECT name FROM schema_migrations WHERE name = ?', [key]);
        if (done.length) continue;
        // DDL is not transactional in MySQL. Do not rerun a partially failed
        // step blindly: inspect the schema first if a crash occurs here.
        await connection.query(statement);
        await connection.execute('INSERT INTO schema_migrations (name) VALUES (?)', [key]);
      }
    }
  } finally {
    try { if (locked) await connection.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':migrations'))"); }
    finally { connection.release(); }
  }
}
if (require.main === module) {
  const pool = createPool();
  migrate(pool).then(() => console.log('Миграции применены.'))
    .catch(error => { console.error('Миграция не завершена:', error.code || error.message); process.exitCode = 1; })
    .finally(() => pool.end());
}
module.exports = { migrate };
