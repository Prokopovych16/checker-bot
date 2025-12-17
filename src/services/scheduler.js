import cron from 'node-cron';
import { fetchSites } from './apiService.js';
import { monitorAllSitesBatch } from './batchChecker.js';
import { checkSuspectedServers, cleanupRemovedSites } from './monitor.js';

// === ФЛАГ ЩОБ УНИКНУТИ НАСЛАЮВАННЯ ===
let isRunning = false;

/**
 * Функція що виконує перевірку всіх сайтів
 */
export async function runCheck() {
  // === ПЕРЕВІРКА: чи вже йде перевірка ===
  if (isRunning) {
    console.log('⚠️ Перевірка вже виконується, пропускаю новий запуск...\n');
    return;
  }
  
  // Встановлюємо флаг
  isRunning = true;
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🚀 Запуск перевірки - ${new Date().toLocaleString('uk-UA')}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    const startTime = Date.now();
    
    const sites = await fetchSites();
    
    if (!sites || !Array.isArray(sites)) {
      console.error('❌ fetchSites повернув невалідний результат');
      return;
    }
    
    if (sites.length === 0) {
      console.log('⚠️  Немає сайтів для перевірки\n');
      return;
    }
    
    console.log(`Всього сайтів: ${sites.length}\n`);

    // Очищення БД
    try {
      const cleanup = await cleanupRemovedSites(sites);
      if (cleanup && cleanup.removed > 0) {
        console.log(`✓ Очищено ${cleanup.removed} blocked/видалених сайтів з БД\n`);
      }
    } catch (cleanupError) {
      console.error('⚠️ Помилка при очищенні БД:', cleanupError.message);
    }
    
    // Основна перевірка
    const results = await monitorAllSitesBatch(sites, 100);
    
    if (!results) {
      console.error('❌ monitorAllSitesBatch повернув null');
      return;
    }
    
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2) + 's';

    // Аналіз серверів
    // console.log('🔍 Аналіз серверів...');
    // try {
    //   await checkSuspectedServers();
    // } catch (serverError) {
    //   console.error('⚠️ Помилка при аналізі серверів:', serverError.message);
    // }
    
    console.log('✅ Перевірку завершено\n');
    
  } catch (error) {
    console.error('❌ КРИТИЧНА ПОМИЛКА під час перевірки:', error.message);
    
    if (process.env.NODE_ENV === 'development') {
      console.error('   Stack trace:', error.stack);
    }
  } finally {
    // === ЗАВЖДИ ЗНІМАЄМО ФЛАГ ===
    isRunning = false;
  }
}

/**
 * Запустити scheduler
 */
export function startScheduler(intervalMinutes = 5) {
  console.log(`⏰ Розклад: перевірка кожні ${intervalMinutes} хвилин`);
  console.log('📍 Перший запуск зараз...\n');
  
  // Перший запуск одразу
  runCheck().catch(error => {
    console.error('❌ Помилка при першому запуску перевірки:', error.message);
    isRunning = false; // Знімаємо флаг при помилці
  });
  
  // Налаштовуємо cron
  const cronPattern = `*/${intervalMinutes} * * * *`;
  
  const task = cron.schedule(cronPattern, async () => {
    try {
      await runCheck();
    } catch (error) {
      console.error('❌ Помилка в cron task:', error.message);
      isRunning = false; // Знімаємо флаг при помилці
    }
  });
  
  if (!task) {
    console.error('❌ КРИТИЧНА ПОМИЛКА: не вдалося запустити cron scheduler!');
    console.error('   Перевірте cron pattern:', cronPattern);
    process.exit(1);
  }
  
  console.log('✅ Scheduler запущено. Бот працює у фоні...');
  console.log('⌨️  Натисни Ctrl+C щоб зупинити\n');
  
  return task;
}

export function stopScheduler(task) {
  if (task) {
    task.stop();
    console.log('⏹️  Scheduler зупинено');
  }
}