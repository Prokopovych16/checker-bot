import { startScheduler, runCheck, stopScheduler } from './services/scheduler.js';
import { setupBotCommands } from './bot/botCommands.js';
import pool from './config/database.js';

console.log('\n╔═══════════════════════════════════════════╗');
console.log('║     🤖 Site Monitor Bot запущено         ║');
console.log('╚═══════════════════════════════════════════╝\n');

let schedulerTask = null;

try {
  setupBotCommands(runCheck);
  
  // Запускаємо scheduler (кожні 5 хвилин)
  schedulerTask = startScheduler(5);
  
} catch (error) {
  console.error('❌ КРИТИЧНА ПОМИЛКА при запуску:', error.message);
  process.exit(1);
}

async function shutdown(signal) {
  console.log(`\n\n⚠️ ${signal} отримано - зупинка бота...`);
  
  try {
    if (schedulerTask) {
      stopScheduler(schedulerTask);
    }
    
    await pool.end();
    console.log('✅ База даних закрита');
    
    console.log('👋 Бот зупинено\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Помилка при зупинці:', error.message);
    process.exit(1);
  }
}

process.on('unhandledRejection', (error) => {
  console.error('💥 Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  shutdown('UNCAUGHT_EXCEPTION');
});


process.on('SIGINT', () => shutdown('SIGINT'));


process.on('SIGTERM', () => shutdown('SIGTERM'));