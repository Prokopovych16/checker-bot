import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Пул підключень до PostgreSQL
export const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Перевірка підключення
pool.on('connect', () => {
  console.log('✅ Підключено до PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Помилка PostgreSQL:', err);
});

export default pool;