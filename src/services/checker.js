import axios from 'axios';

// Налаштування
const CHECK_TIMEOUT_FIRST = 12000;  
const CHECK_TIMEOUT_RETRY = 10000;  
const MAX_RETRIES = 0; // к-ть повторних перевірок
const RETRY_DELAY = 1500;           
const MIN_VALID_HTML_SIZE = 500;
const MIN_TOTAL_TAGS = 10;        
const MIN_CONTENT_TAGS = 3;      
const MIN_TEXT_LENGTH = 100;      
const MIN_MEANINGFUL_LENGTH = 50;
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

// Ключові слова для виявлення suspended акаунтів
const SUSPENSION_KEYWORDS = [
  'account suspended',
  'bandwidth limit exceeded',
  'site suspended',
  'service unavailable',
  'temporarily unavailable',
  'hosting account',
  'payment required',
  'Houston, we have a problem',
  'this account has been suspended'
];

// Ключові слова для виявлення помилок бази даних
const DATABASE_ERROR_KEYWORDS = [
  'database error',
  'database connection',
  'error establishing a database connection',
  'mysql error',
  'mysqli error',
  'postgresql error',
  'connection refused',
  'could not connect to database',
  'database server is not responding',
  'cannot connect to mysql',
  'can\'t connect to mysql',
  'access denied for user',
  'unknown database',
  'table doesn\'t exist',
  'too many connections',
  'database is locked',
  'db connection failed',
  'failed to connect to database'
];

/**
 * Перевірка наявності ключових слів в HTML
 */
function checkKeywords(html, keywords) {
  if (!html || typeof html !== 'string') return false;
  
  const lowerHtml = html.toLowerCase();
  return keywords.some(keyword => lowerHtml.includes(keyword));
}

/**
 * Перевірка чи це SSL помилка
 */
function isSSLError(error) {
  return error.code === 'CERT_HAS_EXPIRED' || 
         error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
         error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
         error.message?.includes('certificate') ||
         error.message?.includes('SSL');
}

/**
 * Перевірка чи це timeout помилка (варто retry)
 */
function isTimeoutError(error) {
  return error.code === 'ECONNABORTED' || 
         error.code === 'ETIMEDOUT' ||
         error.code === 'ECONNRESET';
}

/**
 * Перевірка HTML структури
 */
function hasValidHtmlStructure(html) {
  if (!html || typeof html !== 'string') return false;
  
  // Перевіряємо наявність базових HTML тегів
  const hasHtmlTag = /<html/i.test(html);
  const hasBodyTag = /<body/i.test(html);
  
  return hasHtmlTag && hasBodyTag;
}

/**
 * Перевірка чи це SPA (Single Page Application)
 * React, Vue, Angular, Next.js, Nuxt тощо
 */
function isSinglePageApp(html) {
  if (!html || typeof html !== 'string') return { isSPA: false };
  
  // 1. Пошук кореневих div'ів SPA
  const spaRootPatterns = [
    /<div\s+id=["']root["']/i,           
    /<div\s+id=["']app["']/i,            
    /<div\s+id=["']__next["']/i,         
    /<div\s+id=["']__nuxt["']/i,        
    /<div\s+ng-app/i,                   
    /<div\s+data-reactroot/i,           
    /<div\s+data-react-helmet/i         
  ];
  
  const hasSpaRoot = spaRootPatterns.some(pattern => pattern.test(html));
  
  // 2. Пошук JavaScript бандлів
  const scriptTags = html.match(/<script[^>]*src=/gi);
  const scriptCount = scriptTags ? scriptTags.length : 0;
  
  // Пошук inline скриптів
  const inlineScripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi);
  const inlineScriptCount = inlineScripts ? inlineScripts.length : 0;
  
  const totalScripts = scriptCount + inlineScriptCount;
  
  // 3. Пошук характерних бібліотек
  const hasSpaLibraries = 
    /react/i.test(html) ||
    /vue/i.test(html) ||
    /angular/i.test(html) ||
    /next\.js/i.test(html) ||
    /webpack/i.test(html) ||
    /chunk/i.test(html) ||
    /bundle/i.test(html);
  
  // 4. Пошук meta тегів від SPA frameworks
  const hasSpaMeta = 
    /<meta\s+name=["']generator["']\s+content=["'](Next\.js|Nuxt|Gatsby)/i.test(html) ||
    /<meta\s+name=["']framework["']/i.test(html);
  
  // 5. Підрахунок реального текстового контенту (без скриптів)
  const htmlWithoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  const textContent = htmlWithoutScripts.replace(/<[^>]*>/g, '').trim();
  const hasMinimalContent = textContent.length < 200;
  
  // Логіка визначення SPA:
  const isSPA = 
    hasSpaRoot ||
    hasSpaMeta ||
    (totalScripts >= 2 && hasMinimalContent) ||
    (hasSpaLibraries && hasMinimalContent && totalScripts >= 1);
  
  if (isSPA) {
    return {
      isSPA: true,
      indicators: {
        hasSpaRoot,
        scriptCount: totalScripts,
        hasSpaLibraries,
        hasSpaMeta,
        textContentLength: textContent.length
      }
    };
  }
  
  return { isSPA: false };
}

/**
 * Перевірка чи HTML порожній або майже порожній
 */
function isEmptyHtml(html) {
  if (!html || typeof html !== 'string') return true;
  
  // Видаляємо всі HTML теги
  const textContent = html.replace(/<[^>]*>/g, '').trim();
  
  // Якщо після видалення тегів залишилось менше MIN_TEXT_LENGTH символів - сторінка порожня
  if (textContent.length < MIN_TEXT_LENGTH) {
    return true;
  }
  
  // Перевіряємо чи це не просто пробіли/переноси рядків
  const meaningfulContent = textContent.replace(/\s+/g, '');
  if (meaningfulContent.length < MIN_MEANINGFUL_LENGTH) {
    return true;
  }
  
  return false;
}

/**
 * Перевірка наявності змістовного контенту в HTML
 */
function hasValidContent(html) {
  if (!html || typeof html !== 'string') {
    return { valid: false, reason: 'No HTML content' };
  }
  
  // Масив змістовних тегів для перевірки
  const contentTags = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',  // Заголовки
    'p',                                  // Параграфи
    'article', 'section', 'main',         // Семантичні секції
    'div',                                // Контейнери
    'span',                               // Inline елементи
    'ul', 'ol', 'li',                     // Списки
    'table', 'tr', 'td',                  // Таблиці
    'img',                                // Зображення
    'a',                                  // Посилання
    'button', 'input', 'form'             // Форми
  ];
  
  // Підраховуємо кількість кожного тега
  const tagCounts = {};
  let totalTags = 0;
  
  for (const tag of contentTags) {
    // Шукаємо відкриваючі теги (включно з атрибутами)
    const regex = new RegExp(`<${tag}[\\s>]`, 'gi');
    const matches = html.match(regex);
    const count = matches ? matches.length : 0;
    
    if (count > 0) {
      tagCounts[tag] = count;
      totalTags += count;
    }
  }
  
  // Перевірка 1: Загальна кількість тегів
  if (totalTags < MIN_TOTAL_TAGS) {
    return {
      valid: false,
      reason: `Too few content tags (${totalTags}/${MIN_TOTAL_TAGS}) - сайт майже пустий`,
      tagCounts
    };
  }
  
  // Перевірка 2: Різноманітність тегів
  const uniqueTagTypes = Object.keys(tagCounts).length;
  if (uniqueTagTypes < MIN_CONTENT_TAGS) {
    return {
      valid: false,
      reason: `Too few tag types (${uniqueTagTypes}/${MIN_CONTENT_TAGS}) - підозріло простий HTML`,
      tagCounts
    };
  }
  
  // Перевірка 3: Наявність заголовків (h1-h6) або параграфів
  const hasHeadings = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].some(tag => tagCounts[tag] > 0);
  const hasParagraphs = tagCounts['p'] > 0;
  const hasSections = ['article', 'section', 'main'].some(tag => tagCounts[tag] > 0);
  
  if (!hasHeadings && !hasParagraphs && !hasSections) {
    return {
      valid: false,
      reason: 'No headings, paragraphs or sections - не схоже на справжню сторінку',
      tagCounts
    };
  }
  
  // Все ок - контент виглядає валідно
  return {
    valid: true,
    totalTags,
    uniqueTagTypes,
    tagCounts
  };
}

/**
 * Комплексна перевірка HTTP статусу та контенту
 */
function checkHttpStatus(status, html, response) {

  // Перевірка на suspended акаунт
  if (checkKeywords(html, SUSPENSION_KEYWORDS)) {
    return {
      isUp: false,
      error: 'Account suspended'
    };
  }
  
  // Перевірка на помилки бази даних
  if (checkKeywords(html, DATABASE_ERROR_KEYWORDS)) {
    return {
      isUp: false,
      error: 'Database error - сайт недоступний'
    };
  }

  if (status >= 200 && status < 300) {
    
    // Перевірка розміру відповіді
    if (html.length < MIN_VALID_HTML_SIZE) {
      return {
        isUp: false,
        error: `Suspicious small response (${html.length} bytes) - можлива помилка`
      };
    }
    
    // Перевірка HTML структури
    if (!hasValidHtmlStructure(html)) {
      return {
        isUp: false,
        error: 'Invalid HTML structure - missing <html> or <body> tags'
      };
    }
    
    // ✅ ПЕРЕВІРКА: чи це SPA (React/Vue/Angular)
    const spaCheck = isSinglePageApp(html);
    
    if (spaCheck.isSPA) {
      // Це SPA - пропускаємо перевірку контенту
      return {
        isUp: true,
        message: 'OK (SPA detected)',
        isSPA: true,
        spaIndicators: spaCheck.indicators
      };
    }
    
    // Якщо НЕ SPA - перевіряємо контент
    
    // Перевірка: чи HTML порожній
    if (isEmptyHtml(html)) {
      return {
        isUp: false,
        error: 'Empty HTML - сторінка без контенту (можлива помилка)'
      };
    }
    
    // Перевірка: чи є змістовний контент
    const contentCheck = hasValidContent(html);
    if (!contentCheck.valid) {
      return {
        isUp: false,
        error: contentCheck.reason,
        details: contentCheck.tagCounts
      };
    }
    
    // Перевірка Content-Type header
    const contentType = response.headers['content-type'];
    if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return {
        isUp: false,
        error: `Wrong content-type: ${contentType} (expected HTML)`
      };
    }
    
    return {
      isUp: true,
      message: 'OK',
      contentStats: {
        totalTags: contentCheck.totalTags,
        uniqueTypes: contentCheck.uniqueTagTypes
      }
    };
  }

  if (status >= 300 && status < 400) {
    return {
      isUp: true,
      message: `Redirect: ${status}`
    };
  }

  if (status === 404) {
    return {
      isUp: false,
      error: 'Page not found (404)'
    };
  }
  
  if (status === 403) {
    return {
      isUp: false,
      error: 'Access forbidden (403)'
    };
  }
  
  if (status >= 400 && status < 500) {
    return {
      isUp: true,
      message: `Client error: ${status}`
    };
  }
  
  return {
    isUp: true,
    message: `Unknown status: ${status}`
  };
}

/**
 * Обробка помилок підключення
 */
function handleConnectionError(error) {
  // Timeout
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return {
      isUp: false,
      error: 'Timeout - сайт не відповідає',
      isTimeout: true
    };
  }
  
  // DNS помилка
  if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
    return {
      isUp: false,
      error: 'DNS помилка - домен не знайдено'
    };
  }
  
  // Сервер відхилив з'єднання
  if (error.code === 'ECONNREFUSED') {
    return {
      isUp: false,
      error: 'З\'єднання відхилено - сервер вимкнений'
    };
  }
  
  // З'єднання розірвано
  if (error.code === 'ECONNRESET') {
    return {
      isUp: false,
      error: 'З\'єднання розірвано',
      isTimeout: true
    };
  }
  
  // SSL помилка
  if (isSSLError(error)) {
    return {
      isUp: false,
      error: 'SSL сертифікат недійсний або відсутній'
    };
  }
  
  // 5xx помилки сервера
  if (error.response && error.response.status >= 500) {
    return {
      isUp: false,
      error: `Server error: ${error.response.status}`
    };
  }
  
  // Інші помилки
  return {
    isUp: false,
    error: error.message || 'Невідома помилка'
  };
}

/**
 * Одна спроба перевірки сайту
 */
async function attemptCheck(url, timeout) {
  const response = await axios.get(url, {
    timeout: timeout,
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache'
    },
    maxRedirects: 5,
    validateStatus: (status) => status < 500 
  });
  
  return response;
}

/**
 * Основна функція перевірки сайту з retry логікою
 */
export async function checkSite(site) {
  // === ВАЛІДАЦІЯ ВХІДНИХ ДАНИХ ===
  if (!site || !site.domain) {
    return {
      isUp: false,
      error: 'Invalid site object or missing domain',
      status: null,
      responseTime: 0
    };
  }

  const url = `https://${site.domain}`;
  let lastError = null;

  // === ЗАГАЛЬНИЙ TRY-CATCH ДЛЯ ВСЬОГО ===
  try {
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
      const startTime = Date.now();
      
      const timeout = attempt === 1 ? CHECK_TIMEOUT_FIRST : CHECK_TIMEOUT_RETRY;
      
      try {
        const response = await attemptCheck(url, timeout);
        const responseTime = Date.now() - startTime;
        
        // Перевірка що response.data існує і це string
        const htmlData = typeof response.data === 'string' 
          ? response.data 
          : String(response.data || '');
        
        const statusCheck = checkHttpStatus(
          response.status, 
          htmlData, 
          response
        );
        
        return {
          ...statusCheck,
          status: response.status,
          responseTime: responseTime
        };
        
      } catch (error) {
        const responseTime = Date.now() - startTime;
        const errorResult = handleConnectionError(error);
        lastError = errorResult;
        
        // Якщо не timeout - відразу повертаємо помилку
        if (!errorResult.isTimeout) {
          return {
            ...errorResult,
            status: error.response?.status || null,
            responseTime: responseTime
          };
        }
        
        // Якщо timeout і є ще спроби - повторюємо
        if (attempt < MAX_RETRIES + 1) {
          console.log(`  ⏱️  ${site.domain} - timeout ${timeout/1000}с (спроба ${attempt}/${MAX_RETRIES + 1}), повторюю через ${RETRY_DELAY/1000}с...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          continue;
        }
        
        // Остання спроба не вдалась
        return {
          ...errorResult,
          status: error.response?.status || null,
          responseTime: responseTime
        };
      }
    }
    
    return lastError;
    
  } catch (unexpectedError) {
    // === КРИТИЧНА ПОМИЛКА ===
    console.error(`❌ CRITICAL ERROR in checkSite(${site.domain}):`, unexpectedError);
    
    return {
      isUp: false,
      error: `Critical error: ${unexpectedError.message}`,
      status: null,
      responseTime: 0
    };
  }
}