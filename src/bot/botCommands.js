import { bot } from './telegram.js';
import { getAllDownSites } from '../db/queries.js';
import { analyzeServers, formatServerReport } from '../services/serverAnalyzer.js';

/**
 * Створює головне меню з кнопками
 */
function getMainMenuKeyboard() {
  return {
    keyboard: [
      [{ text: '🔄 Запустити перевірку' }],
      [{ text: '📋 Список проблемних сайтів' }, { text: '🖥 Проблемні сервери' }],
      [{ text: '❓ Допомога' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

/**
 * Налаштувати команди бота
 */
export function setupBotCommands(runCheckCallback) {
  
  // Команда /start - показати головне меню
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    
    const welcomeMessage = `
👋 <b>Вітаю в Site Monitor Bot!</b>

Оберіть дію з меню нижче:
    `.trim();
    
    await bot.sendMessage(chatId, welcomeMessage, {
      parse_mode: 'HTML',
      reply_markup: getMainMenuKeyboard()
    });
  });
  
  // Команда /help
  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    
    const helpMessage = `
🤖 <b>Site Monitor Bot</b>

<b>Доступні функції:</b>

🔄 <b>Запустити перевірку</b>
Примусово перевіряє всі сайти зараз

📋 <b>Список проблемних сайтів</b>
Показує всі сайти що зараз не працюють

🖥 <b>Проблемні сервери</b>
Показує сервери де впало ≥2 сайтів (підозра на проблему сервера)

❓ <b>Допомога</b>
Показує цю довідку

━━━━━━━━━━━━━━━━━━━━━━━━
Бот автоматично перевіряє сайти кожні 5 хвилин і надсилає повідомлення про зміни статусу.
    `.trim();
    
    await bot.sendMessage(chatId, helpMessage, {
      parse_mode: 'HTML',
      reply_markup: getMainMenuKeyboard()
    });
  });
  
  // Обробка натискань на кнопки
  bot.on('message', async (msg) => {
    // Ігноруємо команди (вони обробляються окремо)
    if (msg.text && msg.text.startsWith('/')) {
      return;
    }
    
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Кнопка: Запустити перевірку
    if (text === '🔄 Запустити перевірку') {
      console.log('📱 Натиснуто: Запустити перевірку');
      
      await bot.sendMessage(chatId, '🔄 Запускаю перевірку всіх сайтів...', {
        reply_markup: getMainMenuKeyboard()
      });
      
      try {
        await runCheckCallback();
        await bot.sendMessage(chatId, '✅ Перевірку завершено! Дивіться результати вище.', {
          reply_markup: getMainMenuKeyboard()
        });
      } catch (error) {
        console.error('Помилка при ручній перевірці:', error);
        await bot.sendMessage(chatId, '❌ Помилка при перевірці сайтів', {
          reply_markup: getMainMenuKeyboard()
        });
      }
      return;
    }
    
    // Кнопка: Список проблемних сайтів
    if (text === '📋 Список проблемних сайтів') {
      console.log('📱 Натиснуто: Список проблемних сайтів');
      
      try {
        const downSites = await getAllDownSites();
        
        if (downSites.length === 0) {
          await bot.sendMessage(chatId, '✅ Всі сайти працюють! 🎉', {
            reply_markup: getMainMenuKeyboard()
          });
          return;
        }
        
        // Формуємо список
        let message = `⚠️ <b>Проблемні сайти (${downSites.length}):</b>\n\n`;
        
        downSites.forEach((site, index) => {
          const downSince = new Date(site.down_since);
          const now = new Date();
          const downtimeMs = now - downSince;
          const downtimeMinutes = Math.floor(downtimeMs / 1000 / 60);
          const downtimeHours = Math.floor(downtimeMinutes / 60);
          const remainingMinutes = downtimeMinutes % 60;
          
          let downtimeText;
          if (downtimeHours > 0) {
            downtimeText = `${downtimeHours}г ${remainingMinutes}хв`;
          } else {
            downtimeText = `${downtimeMinutes}хв`;
          }
          
          message += `${index + 1}. <code>${site.domain}</code>\n`;
          
          const serverInfo = site.vps_ip || site.address;
          if (serverInfo) {
            message += `   🖥 Сервер: <code>${serverInfo}</code>\n`;
          }
          
          message += `   ⏱ Down: ${downtimeText}\n`;
          message += `   ❌ ${site.last_error}\n\n`;
        });
        
        // Telegram має ліміт 4096 символів
        if (message.length > 4000) {
          message = message.substring(0, 3900) + '\n\n... (список обрізано)';
        }
        
        await bot.sendMessage(chatId, message, {
          parse_mode: 'HTML',
          reply_markup: getMainMenuKeyboard()
        });
        
      } catch (error) {
        console.error('Помилка при отриманні списку:', error);
        await bot.sendMessage(chatId, '❌ Помилка при отриманні списку проблемних сайтів', {
          reply_markup: getMainMenuKeyboard()
        });
      }
      return;
    }
    
    // Кнопка: Проблемні сервери
    if (text === '🖥 Проблемні сервери') {
      console.log('📱 Натиснуто: Проблемні сервери');
      
      try {
        const servers = await analyzeServers(2); // мінімум 2 сайти
        const message = formatServerReport(servers);
        
        await bot.sendMessage(chatId, message, {
          parse_mode: 'HTML',
          reply_markup: getMainMenuKeyboard()
        });
        
      } catch (error) {
        console.error('Помилка при аналізі серверів:', error);
        await bot.sendMessage(chatId, '❌ Помилка при аналізі серверів', {
          reply_markup: getMainMenuKeyboard()
        });
      }
      return;
    }
    
    // Кнопка: Допомога
    if (text === '❓ Допомога') {
      console.log('📱 Натиснуто: Допомога');
      
      const helpMessage = `
🤖 <b>Site Monitor Bot</b>

<b>Доступні функції:</b>

🔄 <b>Запустити перевірку</b>
Примусово перевіряє всі сайти зараз

📋 <b>Список проблемних сайтів</b>
Показує всі сайти що зараз не працюють

🖥 <b>Проблемні сервери</b>
Показує сервери де впало ≥2 сайтів (підозра на проблему сервера)

❓ <b>Допомога</b>
Показує цю довідку

━━━━━━━━━━━━━━━━━━━━━━━━
Бот автоматично перевіряє сайти кожні 5 хвилин і надсилає повідомлення про зміни статусу.
      `.trim();
      
      await bot.sendMessage(chatId, helpMessage, {
        parse_mode: 'HTML',
        reply_markup: getMainMenuKeyboard()
      });
      return;
    }
    
    // Якщо натиснули щось невідоме
    if (text && !text.startsWith('/')) {
      await bot.sendMessage(chatId, '❓ Невідома команда. Оберіть дію з меню:', {
        reply_markup: getMainMenuKeyboard()
      });
    }
  });
  
  console.log('✅ Telegram команди та кнопки налаштовано');
}