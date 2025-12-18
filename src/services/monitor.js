import { checkSite } from './checker.js';
import { 
  isDownSiteExists, 
  addDownSite, 
  removeDownSite, 
  removeDeletedSites
} from '../db/queries.js';

/**
 * Моніторинг одного сайту (БЕЗ відправки повідомлень)
 */
export async function monitorSite(site) {
  // === ВАЛІДАЦІЯ ===
  if (!site || !site.id || !site.domain) {
    console.error('❌ Невалідний об\'єкт site:', site);
    return { 
      status: 'error', 
      site: site?.domain || 'unknown',
      siteData: site,
      error: 'Invalid site object' 
    };
  }

  try {
    const result = await checkSite(site);
    
    // Перевірка результату
    if (!result || typeof result.isUp !== 'boolean') {
      console.error(`❌ Невалідний результат перевірки для ${site.domain}`);
      return { 
        status: 'error', 
        site: site.domain,
        siteData: site,
        error: 'Invalid check result' 
      };
    }
    
    // === САЙТ ВПАВ ===
    if (!result.isUp) {
      const exists = await isDownSiteExists(site.id);
      
      if (!exists) {
        // НОВИЙ ПАДІННЯ
        await addDownSite(site, result);
        console.log(`❌ НОВИЙ ПАДІННЯ: ${site.domain} - ${result.error}`);
        
        return { 
          status: 'newly_down', 
          site: site.domain,
          siteData: site,
          error: result.error 
        };
      } else {
        // ВСЕ ЩЕ НЕ ПРАЦЮЄ
        await addDownSite(site, result);
        console.log(`⚠️  Все ще не працює: ${site.domain}`);
        
        return { 
          status: 'still_down', 
          site: site.domain,
          siteData: site
        };
      }
    } 
    // === САЙТ ПРАЦЮЄ ===
    else {
      const exists = await isDownSiteExists(site.id);
      
      if (exists) {
        // ВІДНОВЛЕНО
        const downSite = await removeDownSite(site.id);
        
        // Перевірка downSite
        if (!downSite || !downSite.down_since) {
          console.warn(`⚠️ Не вдалося отримати інфо про downtime для ${site.domain}`);
          console.log(`✅ ВІДНОВЛЕНО: ${site.domain}`);
          
          return { 
            status: 'recovered', 
            site: site.domain,
            siteData: site,
            downtime: 'невідомо' 
          };
        }
        
        // Розрахунок downtime
        const downSince = new Date(downSite.down_since);
        const now = new Date();
        const downtimeMs = now - downSince;
        const downtimeMinutes = Math.floor(downtimeMs / 1000 / 60);
        const downtimeHours = Math.floor(downtimeMinutes / 60);
        const remainingMinutes = downtimeMinutes % 60;
        
        let downtimeText;
        if (downtimeHours > 0) {
          downtimeText = `${downtimeHours} год ${remainingMinutes} хв`;
        } else {
          downtimeText = `${downtimeMinutes} хв`;
        }
        
        console.log(`✅ ВІДНОВЛЕНО: ${site.domain} (Downtime: ${downtimeText})`);
        
        return { 
          status: 'recovered', 
          site: site.domain,
          siteData: site,
          downtime: downtimeText 
        };
      } else {
        // ВСЕ ОК
        return { 
          status: 'up', 
          site: site.domain,
          siteData: site
        };
      }
    }
    
  } catch (error) {
    console.error(`❌ Помилка при моніторингу ${site.domain}:`, error.message);
    return { 
      status: 'error', 
      site: site.domain,
      siteData: site,
      error: error.message 
    };
  }
}

/**
 * Очищення БД від сайтів що зникли з API
 */
export async function cleanupRemovedSites(currentSites) {
  try {
    // === ВАЛІДАЦІЯ ===
    if (!currentSites || !Array.isArray(currentSites)) {
      console.error('❌ cleanupRemovedSites: невалідний масив сайтів');
      return { removed: 0, sites: [], error: 'Invalid sites array' };
    }

    if (currentSites.length === 0) {
      console.warn('⚠️ cleanupRemovedSites: порожній масив сайтів');
      return { removed: 0, sites: [] };
    }
    
    // Отримуємо site_id
    const validSiteIds = currentSites
      .filter(s => s && s.id)
      .map(s => s.id);
    
    if (validSiteIds.length === 0) {
      console.warn('⚠️ Немає валідних site_id');
      return { removed: 0, sites: [] };
    }
    
    const result = await removeDeletedSites(validSiteIds);
    
    // Перевірка result
    if (!result) {
      console.error('❌ removeDeletedSites повернув null');
      return { removed: 0, sites: [] };
    }
    
    if (result.deletedCount > 0) {
      console.log(`\n🧹 Очищено ${result.deletedCount} blocked/видалених сайтів з БД`);
      
      if (result.deletedSites && Array.isArray(result.deletedSites)) {
        result.deletedSites.forEach(site => {
          console.log(`   ✓ Видалено: ${site.domain || site.site_id}`);
        });
      }
    }
    
    return { 
      removed: result.deletedCount || 0, 
      sites: result.deletedSites || [] 
    };
    
  } catch (error) {
    console.error('❌ Помилка при очищенні БД:', error.message);
    return { removed: 0, sites: [], error: error.message };
  }
}

export async function checkSuspectedServers() {
  try {
    const servers = await analyzeServers(2);
    
    if (servers.length > 0) {
      let message = `🚨 <b>УВАГА! Виявлено проблемні сервери</b>\n\n`;
      message += `Знайдено ${servers.length} серверів де впало ≥2 сайтів.\n`;
      message += `Можливо проблема на рівні серверів!\n\n`;
      
      servers.forEach((server, index) => {
        message += `${index + 1}. <b>${server.identifier}</b> - ${server.count} сайтів\n`;
      });
      
      
      await sendTelegramMessage(message);
    }
  } catch (error) {
    console.error('Помилка при перевірці серверів:', error);
  }
}