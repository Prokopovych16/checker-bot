import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

// Створюємо бота з polling для отримання команд
const bot = new TelegramBot(token, { polling: true });

/**
 * Відправити повідомлення в Telegram
 */
export async function sendTelegramMessage(message) {
  try {
    await bot.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
    console.log('📱 Telegram повідомлення відправлено');
    return true;
  } catch (error) {
    console.error('❌ Помилка відправки Telegram:', error.message);
    return false;
  }
}

/**
 * Відправити повідомлення про початок перевірки
 */
export async function sendCheckStartNotification(totalSites) {
  const message = `
🔍 <b>Починаю перевірку сайтів</b>

📊 Всього сайтів: ${totalSites}
🕐 Час: ${new Date().toLocaleString('uk-UA')}
  `.trim();
  
  return await sendTelegramMessage(message);
}

/**
 * Відправити повідомлення про завершення перевірки
 */
export async function sendCheckCompleteNotification(results, duration) {
  const message = `
✅ <b>Перевірку завершено</b>

📊 Результати:
✅ Працюють: ${results.up}
❌ Нові падіння: ${results.newly_down}
⚠️ Все ще не працюють: ${results.still_down}
🎉 Відновлені: ${results.recovered}
${results.errors > 0 ? `⚡ Помилки: ${results.errors}` : ''}

⏱ Час виконання: ${duration}
🕐 Завершено: ${new Date().toLocaleString('uk-UA')}
  `.trim();
  
  return await sendTelegramMessage(message);
}

/**
 * Відправити повідомлення про падіння сайту
 */
export async function sendDownNotification(site, error) {
  const serverInfo = site.vps_ip || site.address;
  
  const message = `
❌ <b>Сайт впав</b>

🌐 Домен: <code>${site.domain}</code>
${serverInfo ? `🖥 Сервер: <code>${serverInfo}</code>\n` : ''}⚠️ Помилка: ${error}
🕐 Час: ${new Date().toLocaleString('uk-UA')}
  `.trim();
  
  return await sendTelegramMessage(message);
}

/**
 * Відправити повідомлення про відновлення сайту
 */
export async function sendRecoveryNotification(site, downtime) {
  const serverInfo = site.vps_ip || site.address;
  
  const message = `
✅ <b>Сайт відновлено</b>

🌐 Домен: <code>${site.domain}</code>
${serverInfo ? `🖥 Сервер: <code>${serverInfo}</code>\n` : ''}⏱ Downtime: ${downtime}
🕐 Час: ${new Date().toLocaleString('uk-UA')}
  `.trim();
  
  return await sendTelegramMessage(message);
}

/**
 * Експортуємо bot для використання в інших місцях
 */
export { bot };