const mysql = require('mysql2/promise');
function createPool(overrides = {}) {
  return mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'fragrance',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'scent_craft_db',
    waitForConnections: true, connectionLimit: 10, ...overrides,
  });
}
module.exports = { createPool };
