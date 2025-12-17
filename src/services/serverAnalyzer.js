import { getAllDownSites } from '../db/queries.js';

/**
 * Аналізує проблемні сайти і знаходить сервери з множинними падіннями
 */
export async function analyzeServers(minSitesThreshold = 2) {
  try {
    const downSites = await getAllDownSites();
    
    if (!downSites || downSites.length === 0) {
      return [];
    }

    // Групуємо за vps_ip
    const serverMap = new Map();
    
    downSites.forEach(site => {
      const identifier = site.vps_ip || site.address || 'unknown';
      
      if (identifier === 'unknown') return;
      
      if (!serverMap.has(identifier)) {
        serverMap.set(identifier, {
          identifier,
          type: site.vps_ip ? 'vps_ip' : 'address',
          sites: [],
          count: 0
        });
      }
      
      const server = serverMap.get(identifier);
      server.sites.push({
        domain: site.domain,
        down_since: site.down_since,
        last_error: site.last_error
      });
      server.count++;
    });
    
    // Фільтруємо тільки ті сервери де >= порогового значення
    const suspectedServers = Array.from(serverMap.values())
      .filter(server => server.count >= minSitesThreshold)
      .sort((a, b) => b.count - a.count); // Сортуємо за кількістю
    
    return suspectedServers;
    
  } catch (error) {
    console.error('Помилка при аналізі серверів:', error);
    return [];
  }
}

/**
 * Форматує повідомлення про підозрілі сервери
 */
export function formatServerReport(servers) {
  if (!servers || servers.length === 0) {
    return '✅ Немає серверів з множинними проблемами';
  }
  
  let message = `🚨 <b>Підозрілі сервери (${servers.length})</b>\n\n`;
  
  servers.forEach((server, index) => {
    const downtimeText = getEarliestDowntime(server.sites);
    
    message += `${index + 1}. <b>${server.identifier}</b>\n`;
    message += `   ⚠️ Проблемних сайтів: ${server.count}\n`;
    message += `   ⏱ Найдавніше падіння: ${downtimeText}\n`;
    message += `   📋 Сайти:\n`;
    
    // Показуємо перші 5 сайтів
    server.sites.slice(0, 5).forEach(site => {
      message += `      • ${site.domain}\n`;
    });
    
    if (server.sites.length > 5) {
      message += `      ... та ще ${server.sites.length - 5}\n`;
    }
    
    message += '\n';
  });
  
  return message;
}

/**
 * Знаходить найдавніше падіння серед сайтів
 */
function getEarliestDowntime(sites) {
  let earliest = null;
  
  sites.forEach(site => {
    if (site.down_since) {
      const downSince = new Date(site.down_since);
      if (!earliest || downSince < earliest) {
        earliest = downSince;
      }
    }
  });
  
  if (!earliest) return 'невідомо';
  
  const now = new Date();
  const diffMs = now - earliest;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 60) return `${diffMins} хв`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} год`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} дн`;
}