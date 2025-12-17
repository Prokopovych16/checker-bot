import { monitorSite } from './monitor.js';

const DEFAULT_BATCH_SIZE = 100;

/**
 * Розбити масив на батчі
 */
function chunkArray(array, chunkSize) {
  if (!Array.isArray(array) || array.length === 0) return [];
  
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Перевірити батч сайтів паралельно
 */
async function checkBatch(sites) {
  const promises = sites.map(site => monitorSite(site));
  const results = await Promise.allSettled(promises);
  
  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      console.error(`❌ Помилка при перевірці ${sites[index]?.domain}:`, result.reason);
      return { status: 'error', site: sites[index]?.domain || 'unknown' };
    }
  });
}

/**
 * Перевірити всі сайти батчами
 */
export async function monitorAllSitesBatch(sites, batchSize = DEFAULT_BATCH_SIZE) {
  // Проста валідація
  if (!Array.isArray(sites) || sites.length === 0) {
    console.error('❌ Невалідний масив сайтів');
    return null;
  }
  
  try {
    const startTime = Date.now();
    
    console.log(`\n🔍 Починаю перевірку ${sites.length} сайтів (батчами по ${batchSize})...\n`);
    
    const results = {
      up: 0,
      newly_down: 0,
      still_down: 0,
      recovered: 0,
      errors: 0
    };
    
    const batches = chunkArray(sites, batchSize);
    console.log(`📦 Всього батчів: ${batches.length}\n`);
    
    // Обробляємо кожен батч
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchStartTime = Date.now();
      
      console.log(`⚡ Батч ${i + 1}/${batches.length}: перевіряю ${batch.length} сайтів...`);
      
      const batchResults = await checkBatch(batch);
      
      // Рахуємо результати
      batchResults.forEach(result => {
        const status = result?.status || 'errors';
        results[status] = (results[status] || 0) + 1;
      });
      
      const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(2);
      console.log(`   ✅ Завершено за ${batchDuration}s\n`);
    }
    
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('📊 Підсумок перевірки:');
    console.log(`✅ Працюють: ${results.up}`);
    console.log(`❌ Нові падіння: ${results.newly_down}`);
    console.log(`⚠️  Все ще не працюють: ${results.still_down}`);
    console.log(`🎉 Відновлені: ${results.recovered}`);
    if (results.errors > 0) {
      console.log(`⚡ Помилки: ${results.errors}`);
    }
    console.log(`⏱️  Загальний час: ${totalDuration}s\n`);
    
    return results;
    
  } catch (error) {
    console.error('❌ Помилка в monitorAllSitesBatch:', error.message);
    return null;
  }
}