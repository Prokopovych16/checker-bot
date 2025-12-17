import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const API_URL = process.env.API_URL;
const API_TOKEN = process.env.API_TOKEN;

/**
 * Валідація ENV змінних
 */
function validateEnv() {
  if (!API_URL || !API_TOKEN) {
    console.error('❌ КРИТИЧНА ПОМИЛКА: відсутні API_URL або API_TOKEN в .env файлі!');
    console.error('   Перевірте файл .env');
    return false;
  }
  return true;
}

/**
 * Отримання списку сайтів з API
 */
export async function fetchSites() {
  // Перевірка ENV змінних
  if (!validateEnv()) {
    console.error('⚠️ Пропускаю отримання сайтів - невалідна конфігурація');
    return [];
  }

  try {
    console.log('📡 Отримую дані з API...');

    const response = await axios.get(API_URL, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${API_TOKEN}`,
      },
      timeout: 15000 // 15 секунд timeout
    });

    // Перевірка структури відповіді
    if (!response.data) {
      console.error('❌ API повернув порожню відповідь');
      return [];
    }

    // Перевірка що data.data існує
    if (!response.data.data) {
      console.error('❌ Невалідна структура API відповіді (немає data.data)');
      console.error('   Отримано:', Object.keys(response.data));
      return [];
    }

    const sites = response.data.data;

    // Перевірка що це масив
    if (!Array.isArray(sites)) {
      console.error('❌ API повернув не масив:', typeof sites);
      return [];
    }

    // Перевірка що масив не порожній
    if (sites.length === 0) {
      console.warn('⚠️ API повернув порожній список сайтів');
      return [];
    }

    console.log(`✅ Отримано ${sites.length} сайтів`);
    return sites;

  } catch (error) {
    console.error('❌ Помилка при отриманні даних з API');
    
    // Детальний лог помилки
    if (error.response) {
      // Сервер відповів з помилкою
      console.error(`   Статус: ${error.response.status}`);
      console.error(`   Повідомлення: ${error.response.statusText}`);
      
      if (error.response.status === 401) {
        console.error('   ⚠️ Невалідний API токен! Перевірте API_TOKEN в .env');
      } else if (error.response.status === 404) {
        console.error('   ⚠️ API endpoint не знайдено! Перевірте API_URL в .env');
      } else if (error.response.status === 429) {
        console.error('   ⚠️ Rate limit перевищено! Забагато запитів до API');
      }
    } else if (error.request) {
      // Запит був відправлений, але відповіді не було
      console.error('   Немає відповіді від сервера');
      console.error('   Перевірте інтернет з\'єднання або доступність API');
    } else {
      // Щось інше сталося
      console.error(`   Повідомлення: ${error.message}`);
    }
    
    // Логування stack trace тільки в development
    if (process.env.NODE_ENV === 'development') {
      console.error('   Stack trace:', error.stack);
    }
    
    return [];
  }
}