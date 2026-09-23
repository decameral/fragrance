const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { rateLimit } = require('express-rate-limit');
const { MysqlSessionStore } = require('../lib/session-store');
const { InputError } = require('../lib/quote');
const validate = require('../lib/validation');
const { cart, changeCart, checkout, getOrder, repeatOrder } = require('../lib/shop');
const { adminRoutes } = require('./admin');
const { changeStatus } = require('../lib/order-status');

const csrf = () => randomBytes(32).toString('hex');
const invoke = (object, method) => new Promise((resolve, reject) => object[method](error => error ? reject(error) : resolve()));
const dummyHash = bcrypt.hashSync(randomBytes(24).toString('hex'), 12);

function customerRoutes(pool, secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
  const router = express.Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(session({ name: 'fragrance.sid', secret, store: new MysqlSessionStore(pool),
    resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 },
  }));
  router.use(async (req, res, next) => {
    if (req.session.userId) {
      const [[user]] = await pool.execute('SELECT id, name, email, phone, role FROM users WHERE id = ?', [req.session.userId]);
      req.user = user;
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const expected = req.session.csrfToken;
      const supplied = req.get('X-CSRF-Token');
      if (!expected || !supplied || !/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) {
        throw new InputError('Сессия устарела. Обновите страницу и повторите действие.', 403);
      }
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new InputError('Ожидается объект JSON.');
    }
    next();
  });
  router.get('/auth/me', (req, res) => {
    req.session.csrfToken ||= csrf();
    res.json({ user: req.user || null, csrfToken: req.session.csrfToken });
  });
  const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Слишком много попыток. Повторите через 15 минут.' } });
  async function signIn(req, userId) {
    await invoke(req.session, 'regenerate');
    req.session.userId = userId; req.session.csrfToken = csrf();
    await invoke(req.session, 'save');
  }
  router.post('/auth/register', authLimit, async (req, res) => {
    const name = validate.text(req.body.name, 'Имя', 80);
    const email = validate.text(req.body.email, 'Email', 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError('Укажите корректный email.');
    const password = req.body.password;
    if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72) throw new InputError('Пароль: не менее 8 символов и не более 72 байт.');
    const hash = await bcrypt.hash(password, 12);
    let result;
    try {
      [result] = await pool.execute('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [name, email, hash]);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw new InputError('Этот email уже зарегистрирован.', 409);
      throw error;
    }
    await signIn(req, result.insertId);
    res.status(201).json({ csrfToken: req.session.csrfToken });
  });
  router.post('/auth/login', authLimit, async (req, res) => {
    const email = validate.text(req.body.email, 'Email', 254).toLowerCase();
    const password = req.body.password;
    if (typeof password !== 'string' || Buffer.byteLength(password) > 72) throw new InputError('Неверный email или пароль.', 401);
    const [[user]] = await pool.execute('SELECT id, password_hash FROM users WHERE email = ?', [email]);
    const matches = await bcrypt.compare(password, user?.password_hash || dummyHash);
    if (!user || !matches) throw new InputError('Неверный email или пароль.', 401);
    await signIn(req, user.id);
    res.json({ csrfToken: req.session.csrfToken });
  });
  router.post('/auth/logout', async (req, res) => {
    await invoke(req.session, 'destroy');
    res.clearCookie('fragrance.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    res.json({ ok: true });
  });
  router.use((req, res, next) => { if (!req.user) throw new InputError('Войдите в аккаунт.', 401); next(); });
  router.use('/admin', adminRoutes(pool));
  router.patch('/profile', async (req, res) => {
    const name = validate.text(req.body.name, 'Имя', 80);
    const phone = req.body.phone === '' ? '' : validate.phone(req.body.phone);
    await pool.execute('UPDATE users SET name = ?, phone = ? WHERE id = ?', [name, phone, req.user.id]);
    res.json({ user: { ...req.user, name, phone } });
  });
  router.get('/cart', async (req, res) => res.json(await cart(pool, req.user.id)));
  router.post('/cart', async (req, res) => res.status(201).json(await changeCart(pool, req.user.id, 'add', req.body)));
  router.patch('/cart/:id', async (req, res) => res.json(await changeCart(pool, req.user.id, 'update', { ...req.body, id: validate.id(req.params.id) })));
  router.delete('/cart/:id', async (req, res) => res.json(await changeCart(pool, req.user.id, 'delete', { id: validate.id(req.params.id) })));
  router.post('/orders', async (req, res) => res.status(201).json(await checkout(pool, req.user.id, req.body)));
  router.get('/orders', async (req, res) => {
    const [orders] = await pool.execute('SELECT id, status, total_minor, currency, created_at FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 100', [req.user.id]);
    res.json({ orders });
  });
  router.get('/orders/:id', async (req, res) => res.json(await getOrder(pool, req.user.id, validate.id(req.params.id))));
  router.post('/orders/:id/repeat', async (req, res) => res.json(await repeatOrder(pool, req.user.id, validate.id(req.params.id))));
  router.post('/orders/:id/cancel', async (req, res) => {
    await changeStatus(pool, validate.id(req.params.id), req.user.id, 'customer', 'new', 'cancelled', true);
    res.json({ ok: true });
  });
  return router;
}
module.exports = { customerRoutes };
