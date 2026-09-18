const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// Настройки подключения к вашей БД
const pool = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',            // Ваш логин в MySQL
  password: 'Minion2006#',   // Укажите ваш пароль от MySQL!
  database: 'scent_craft_db',
  waitForConnections: true,
  connectionLimit: 10
});

// Эндпоинт для отдачи атмосфер и акцентов
app.get('/api/atmospheres', async (req, res) => {
  try {
    const [atmospheres] = await pool.query('SELECT * FROM atmospheres');

    for (let item of atmospheres) {
      const [accents] = await pool.query(
        `SELECT a.* FROM accents a 
         JOIN atmosphere_accents aa ON a.id = aa.accent_id 
         WHERE aa.atmosphere_id = ?`,
        [item.id]
      );
      item.accents = accents;
    }

    res.json(atmospheres);
  } catch (error) {
    console.error('Ошибка MySQL:', error);
    res.status(500).json({ error: 'Ошибка сервера при получении данных' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});