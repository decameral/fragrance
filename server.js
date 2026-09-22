const express = require('express');
const path = require('node:path');
const { createPool } = require('./db/pool');
const { quote } = require('./lib/quote');
const { customerRoutes } = require('./routes/customer');

function createApp(pool, options = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  // Publish only client assets, never the repository root.
  for (const file of ['index.html', 'beginners.html', 'beginners.js', 'style.css', 'account.html', 'account.js', 'client.js', 'account.css', 'admin.html', 'admin.js', 'admin.css']) {
    app.get(`/${file}`, (req, res) => res.sendFile(path.join(__dirname, file)));
  }
  app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
  app.use('/images', express.static(path.join(__dirname, 'images'), { dotfiles: 'deny', index: false }));
  app.get('/api/atmospheres', async (req, res) => {
    const [atmospheres] = await pool.query('SELECT * FROM atmospheres WHERE active = TRUE ORDER BY title');
    const [accents] = await pool.query(`SELECT n.*, aa.atmosphere_id FROM accents n
      JOIN atmosphere_accents aa ON aa.accent_id = n.id WHERE n.active = TRUE ORDER BY n.name`);
    res.json(atmospheres.map(atmosphere => ({ ...atmosphere,
      accents: accents.filter(note => note.atmosphere_id === atmosphere.id)
        .map(({ atmosphere_id, ...note }) => note),
    })));
  });
  app.get('/api/bottles', async (req, res) => {
    const [bottles] = await pool.query('SELECT id, name, volume_ml, price FROM bottles WHERE active = TRUE ORDER BY volume_ml, price');
    res.json(bottles);
  });
  app.post('/api/quote', async (req, res) => res.json(await quote(pool, req.body)));
  const customer = customerRoutes(pool, options.sessionSecret || process.env.SESSION_SECRET);
  app.use('/api', (req, res, next) => {
    if (/^\/(auth|cart|orders|profile|admin)(\/|$)/.test(req.path)) return customer(req, res, next);
    next();
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Маршрут не найден.' }));
  app.use((error, req, res, next) => {
    const status = error.status || 500;
    if (status >= 500) console.error('Ошибка запроса:', error.code || error.name);
    res.status(status).json({ error: status >= 500 ? 'Сервис временно недоступен. Попробуйте позже.'
      : error.type === 'entity.parse.failed' ? 'Некорректный JSON.' : error.type === 'entity.too.large' ? 'Запрос слишком большой.' : error.message });
  });
  return app;
}
if (require.main === module) {
  const pool = createPool();
  const server = createApp(pool).listen(Number(process.env.PORT || 3000), '127.0.0.1', () => {
    console.log(`Fragrance: http://localhost:${process.env.PORT || 3000}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => pool.end()));
}
module.exports = { createApp };
