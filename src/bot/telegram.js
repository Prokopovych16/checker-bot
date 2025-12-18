import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const chatIdsString = process.env.TELEGRAM_CHAT_ID || '';
const TELEGRAM_CHAT_IDS = chatIdsString.split(',').map(id => id.trim());

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { 
  polling: true,
  request: {
    family: 4 
  }
});
/**
 * Відправити повідомлення на ВСІ chat_id
 */
async function sendToAll(message, options = {}) {
  const results = [];
  
  for (const chatId of TELEGRAM_CHAT_IDS) {
    try {
      await bot.sendMessage(chatId, message, options);
      results.push({ chatId, success: true });
    } catch (error) {
      console.error(`⚠️ Не вдалося відправити в ${chatId}:`, error.message);
      results.push({ chatId, success: false, error: error.message });
    }
  }
  
  return results;
}

/**
 * Відправити повідомлення про падіння сайту (СТАРЕ - не використовується)
 */
export async function sendDownNotification(site, error) {
  const vpsInfo = site.vps_ip || site.address || 'Невідомо';
  
  const message = `❌ <b>САЙТ ВПАВ</b>

🌐 <b>Домен:</b> ${site.domain}
🖥 <b>Сервер:</b> ${vpsInfo}
⚠️ <b>Помилка:</b> ${error}

🕒 <b>Час:</b> ${new Date().toLocaleString('uk-UA')}`;

  await sendToAll(message, { 
    parse_mode: 'HTML',
    disable_web_page_preview: true 
  });
}

/**
 * Відправити повідомлення про відновлення сайту (СТАРЕ - не використовується)
 */
export async function sendRecoveryNotification(site, downtimeText) {
  const vpsInfo = site.vps_ip || site.address || 'Невідомо';
  
  const message = `✅ <b>САЙТ ВІДНОВЛЕНО</b>

🌐 <b>Домен:</b> ${site.domain}
🖥 <b>Сервер:</b> ${vpsInfo}
⏱ <b>Downtime:</b> ${downtimeText}

🕒 <b>Час:</b> ${new Date().toLocaleString('uk-UA')}`;

  await sendToAll(message, { 
    parse_mode: 'HTML',
    disable_web_page_preview: true 
  });
}

/**
 * ✨ BATCH: Відправити повідомлення про ВСІ впалі сайти
 */
export async function sendBatchDownNotification(sites) {
  if (!sites || sites.length === 0) return;
  
  const MAX_SITES_PER_MESSAGE = 20; // Telegram обмеження на довжину
  
  // Розбиваємо на частини якщо більше 20 сайтів
  const chunks = [];
  for (let i = 0; i < sites.length; i += MAX_SITES_PER_MESSAGE) {
    chunks.push(sites.slice(i, i + MAX_SITES_PER_MESSAGE));
  }
  
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    
    let message = `❌ <b>ВПАЛИ САЙТИ (${sites.length})</b>\n\n`;
    
    if (chunks.length > 1) {
      message = `❌ <b>ВПАЛИ САЙТИ (частина ${chunkIndex + 1}/${chunks.length})</b>\n\n`;
    }
    
    chunk.forEach((site, index) => {
      const globalIndex = chunkIndex * MAX_SITES_PER_MESSAGE + index + 1;
      const vpsInfo = site.siteData?.vps_ip || site.siteData?.address || 'Невідомо';
      
      message += `${globalIndex}. <b>${site.domain}</b>\n`;
      message += `   🖥 Сервер: ${vpsInfo}\n`;
      message += `   ⚠️ Помилка: ${site.error}\n\n`;
    });
    
    message += `🕒 <b>Час:</b> ${new Date().toLocaleString('uk-UA')}`;
    
    await sendToAll(message, { 
      parse_mode: 'HTML',
      disable_web_page_preview: true 
    });
    
    // Невелика пауза між повідомленнями
    if (chunkIndex < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

/**
 * ✨ BATCH: Відправити повідомлення про ВСІ відновлені сайти
 */
export async function sendBatchRecoveryNotification(sites) {
  if (!sites || sites.length === 0) return;
  
  const MAX_SITES_PER_MESSAGE = 20;
  
  // Розбиваємо на частини якщо більше 20 сайтів
  const chunks = [];
  for (let i = 0; i < sites.length; i += MAX_SITES_PER_MESSAGE) {
    chunks.push(sites.slice(i, i + MAX_SITES_PER_MESSAGE));
  }
  
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    
    let message = `✅ <b>ВІДНОВИЛИСЬ САЙТИ (${sites.length})</b>\n\n`;
    
    if (chunks.length > 1) {
      message = `✅ <b>ВІДНОВИЛИСЬ САЙТИ (частина ${chunkIndex + 1}/${chunks.length})</b>\n\n`;
    }
    
    chunk.forEach((site, index) => {
      const globalIndex = chunkIndex * MAX_SITES_PER_MESSAGE + index + 1;
      const vpsInfo = site.siteData?.vps_ip || site.siteData?.address || 'Невідомо';
      
      message += `${globalIndex}. <b>${site.domain}</b>\n`;
      message += `   🖥 Сервер: ${vpsInfo}\n`;
      message += `   ⏱ Downtime: ${site.downtime}\n\n`;
    });
    
    message += `🕒 <b>Час:</b> ${new Date().toLocaleString('uk-UA')}`;
    
    await sendToAll(message, { 
      parse_mode: 'HTML',
      disable_web_page_preview: true 
    });
    
    // Невелика пауза між повідомленнями
    if (chunkIndex < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

/**
 * Відправити довільне повідомлення
 */
export async function sendTelegramMessage(message) {
  await sendToAll(message, { 
    parse_mode: 'HTML',
    disable_web_page_preview: true 
  });
}
