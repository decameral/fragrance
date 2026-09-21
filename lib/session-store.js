const session = require('express-session');

class MysqlSessionStore extends session.Store {
  constructor(pool) { super(); this.pool = pool; }
  get(sid, callback) {
    this.pool.execute('SELECT data FROM sessions WHERE sid = ? AND expires > ?', [sid, Date.now()])
      .then(([[row]]) => callback(null, row ? (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) : null))
      .catch(callback);
  }
  set(sid, data, callback) {
    const expires = new Date(data.cookie.expires).getTime();
    this.pool.execute('INSERT INTO sessions (sid, expires, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE expires = ?, data = ?',
      [sid, expires, JSON.stringify(data), expires, JSON.stringify(data)])
      .then(() => this.pool.execute('DELETE FROM sessions WHERE expires <= ? LIMIT 100', [Date.now()]))
      .then(() => callback(null)).catch(callback);
  }
  destroy(sid, callback) {
    this.pool.execute('DELETE FROM sessions WHERE sid = ?', [sid]).then(() => callback(null)).catch(callback);
  }
  touch(sid, data, callback) {
    this.pool.execute('UPDATE sessions SET expires = ? WHERE sid = ?', [new Date(data.cookie.expires).getTime(), sid])
      .then(() => callback(null)).catch(callback);
  }
}
module.exports = { MysqlSessionStore };
