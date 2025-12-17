import pool from '../config/database.js';

// === ЛОГУВАННЯ ПОДІЙ БД ===
pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
});

pool.on('connect', () => {
  console.log('✅ New database connection established');
});


/**
 * Додати сайт в базу (коли він впав)
 */
export async function addDownSite(site, checkResult) {
  const query = `
    INSERT INTO sites (
      site_id, domain, status, vps_ip, address,
      is_up, last_checked_at, down_since, last_error, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, false, NOW(), NOW(), $6, NOW(), NOW())
    ON CONFLICT (site_id) 
    DO UPDATE SET
      domain = EXCLUDED.domain,
      status = EXCLUDED.status,
      vps_ip = EXCLUDED.vps_ip,
      address = EXCLUDED.address,
      last_checked_at = NOW(),
      last_error = EXCLUDED.last_error,
      updated_at = NOW()
    RETURNING *;
  `;
  
  const values = [
    site.id,
    site.domain,
    site.status,
    site.vps_ip || null,
    site.address || null,
    checkResult.error || null
  ];
  
  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error('❌ Error adding down site:', error.message);
    throw error;
  }
}

/**
 * Видалити сайт з бази (коли він відновився)
 */
export async function removeDownSite(siteId) {
  const query = 'DELETE FROM sites WHERE site_id = $1 RETURNING *';
  
  try {
    const result = await pool.query(query, [siteId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('❌ Error removing down site:', error.message);
    throw error;
  }
}

/**
 * Перевірити чи сайт є в базі (чи він впав раніше)
 */
export async function isDownSiteExists(siteId) {
  const query = 'SELECT site_id FROM sites WHERE site_id = $1';
  
  try {
    const result = await pool.query(query, [siteId]);
    return result.rows.length > 0;
  } catch (error) {
    console.error('❌ Error checking site existence:', error.message);
    throw error;
  }
}

/**
 * Отримати інфо про сайт з бази
 */
export async function getDownSite(siteId) {
  const query = 'SELECT * FROM sites WHERE site_id = $1';
  
  try {
    const result = await pool.query(query, [siteId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('❌ Error getting down site:', error.message);
    throw error;
  }
}

/**
 * Отримати всі сайти які зараз не працюють
 */
export async function getAllDownSites() {
  const query = 'SELECT * FROM sites ORDER BY down_since DESC';
  
  try {
    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('❌ Error getting all down sites:', error.message);
    throw error;
  }
}

/**
 * Отримати кількість сайтів що не працюють
 */
export async function getDownSitesCount() {
  const query = 'SELECT COUNT(*) as count FROM sites';
  
  try {
    const result = await pool.query(query);
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('❌ Error getting down sites count:', error.message);
    throw error;
  }
}

/**
 * Видалити сайти яких немає в списку site_id (batch delete)
 */
export async function removeDeletedSites(validSiteIds) {
  if (!validSiteIds || validSiteIds.length === 0) {
    return { deletedCount: 0, deletedSites: [] };
  }
  
  const query = `
    DELETE FROM sites
    WHERE site_id NOT IN (${validSiteIds.map((_, i) => `$${i + 1}`).join(',')})
    RETURNING site_id, domain, down_since, last_error
  `;
  
  try {
    const result = await pool.query(query, validSiteIds);
    
    return {
      deletedCount: result.rowCount,
      deletedSites: result.rows
    };
  } catch (error) {
    console.error('❌ Error removing deleted sites:', error.message);
    throw error;
  }
}

/**
 * Аналіз серверів з проблемами (3+ сайти впали на одному сервері)
 */
export async function analyzeServers(minSitesCount = 3) {
  const query = `
    SELECT 
      COALESCE(vps_ip, address) as identifier,
      COUNT(*) as count,
      array_agg(domain) as domains
    FROM sites
    WHERE is_up = false
    GROUP BY COALESCE(vps_ip, address)
    HAVING COUNT(*) >= $1
    ORDER BY count DESC
  `;
  
  try {
    const result = await pool.query(query, [minSitesCount]);
    return result.rows;
  } catch (error) {
    console.error('❌ Error analyzing servers:', error.message);
    throw error;
  }
}

export default pool;