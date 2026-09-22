const { createPool } = require('../db/pool');

async function grantAdmin(pool, email) {
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Укажите email существующего аккаунта.');
  const [result] = await pool.execute("UPDATE users SET role = 'admin' WHERE email = ?", [email.trim().toLowerCase()]);
  if (!result.affectedRows) throw new Error('Аккаунт не найден. Сначала зарегистрируйте его в приложении.');
}
if (require.main === module) {
  const pool = createPool();
  grantAdmin(pool, process.argv[2]).then(() => console.log('Роль администратора назначена. Обновите личный кабинет.'))
    .catch(error => { console.error(error.code || error.message); process.exitCode = 1; }).finally(() => pool.end());
}
module.exports = { grantAdmin };
