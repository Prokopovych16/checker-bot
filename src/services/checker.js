import axios from 'axios';

// Налаштування таймаутів
const CHECK_TIMEOUT_FIRST = 12000;  
const CHECK_TIMEOUT_RETRY = 10000;  

// Налаштування retry
const MAX_RETRIES_TIMEOUT = 0;     
const MAX_RETRIES_SERVER_ERROR = 2; 
const RETRY_DELAY = 2000;

// Налаштування валідації контенту
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
 * Перевірка чи це timeout помилка
 */
function isTimeoutError(error) {
  return error.code === 'ECONNABORTED' || 
         error.code === 'ETIMEDOUT' ||
         error.code === 'ECONNRESET';
}

/**
 * Перевірка чи це 5xx помилка сервера (потребує retry)
 */
function isServerError(error) {
  if (!error.response) return false;
  
  const status = error.response.status;
  return status === 500 || status === 502 || status === 503;
}

/**
 * Визначення чи потрібен retry та скільки спроб
 */
function getRetryInfo(error) {
  if (isTimeoutError(error)) {
    return {
      shouldRetry: true,
      maxRetries: MAX_RETRIES_TIMEOUT,
      errorType: 'timeout'
    };
  }
  
  if (isServerError(error)) {
    return {
      shouldRetry: true,
      maxRetries: MAX_RETRIES_SERVER_ERROR,
      errorType: 'server_error'
    };
  }
  
  return {
    shouldRetry: false,
    maxRetries: 0,
    errorType: 'other'
  };
}

/**
 * Перевірка HTML структури
 */
function hasValidHtmlStructure(html) {
  if (!html || typeof html !== 'string') return false;
  
  const hasHtmlTag = /<html/i.test(html);
  const hasBodyTag = /<body/i.test(html);
  
  return hasHtmlTag && hasBodyTag;
}

/**
 * Перевірка чи це SPA (Single Page Application)
 */
function isSinglePageApp(html) {
  if (!html || typeof html !== 'string') return { isSPA: false };
  
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
  
  const scriptTags = html.match(/<script[^>]*src=/gi);
  const scriptCount = scriptTags ? scriptTags.length : 0;
  
  const inlineScripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi);
  const inlineScriptCount = inlineScripts ? inlineScripts.length : 0;
  
  const totalScripts = scriptCount + inlineScriptCount;
  
  const hasSpaLibraries = 
    /react/i.test(html) ||
    /vue/i.test(html) ||
    /angular/i.test(html) ||
    /next\.js/i.test(html) ||
    /webpack/i.test(html) ||
    /chunk/i.test(html) ||
    /bundle/i.test(html);
  
  const hasSpaMeta = 
    /<meta\s+name=["']generator["']\s+content=["'](Next\.js|Nuxt|Gatsby)/i.test(html) ||
    /<meta\s+name=["']framework["']/i.test(html);
  
  const htmlWithoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  const textContent = htmlWithoutScripts.replace(/<[^>]*>/g, '').trim();
  const hasMinimalContent = textContent.length < 200;
  
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
 * Перевірка чи HTML порожній
 */
function isEmptyHtml(html) {
  if (!html || typeof html !== 'string') return true;
  
  const textContent = html.replace(/<[^>]*>/g, '').trim();
  
  if (textContent.length < MIN_TEXT_LENGTH) {
    return true;
  }
  
  const meaningfulContent = textContent.replace(/\s+/g, '');
  if (meaningfulContent.length < MIN_MEANINGFUL_LENGTH) {
    return true;
  }
  
  return false;
}

/**
 * Перевірка наявності змістовного контенту
 */
function hasValidContent(html) {
  if (!html || typeof html !== 'string') {
    return { valid: false, reason: 'No HTML content' };
  }
  
  const contentTags = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p',
    'article', 'section', 'main',
    'div',
    'span',
    'ul', 'ol', 'li',
    'table', 'tr', 'td',
    'img',
    'a',
    'button', 'input', 'form'
  ];
  
  const tagCounts = {};
  let totalTags = 0;
  
  for (const tag of contentTags) {
    const regex = new RegExp(`<${tag}[\\s>]`, 'gi');
    const matches = html.match(regex);
    const count = matches ? matches.length : 0;
    
    if (count > 0) {
      tagCounts[tag] = count;
      totalTags += count;
    }
  }
  
  if (totalTags < MIN_TOTAL_TAGS) {
    return {
      valid: false,
      reason: `Too few content tags (${totalTags}/${MIN_TOTAL_TAGS}) - сайт майже пустий`,
      tagCounts
    };
  }
  
  const uniqueTagTypes = Object.keys(tagCounts).length;
  if (uniqueTagTypes < MIN_CONTENT_TAGS) {
    return {
      valid: false,
      reason: `Too few tag types (${uniqueTagTypes}/${MIN_CONTENT_TAGS}) - підозріло простий HTML`,
      tagCounts
    };
  }
  
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
  if (checkKeywords(html, SUSPENSION_KEYWORDS)) {
    return {
      isUp: false,
      error: 'Account suspended'
    };
  }
  
  if (checkKeywords(html, DATABASE_ERROR_KEYWORDS)) {
    return {
      isUp: false,
      error: 'Database error - сайт недоступний'
    };
  }

  if (status >= 200 && status < 300) {
    if (html.length < MIN_VALID_HTML_SIZE) {
      return {
        isUp: false,
        error: `Suspicious small response (${html.length} bytes) - можлива помилка`
      };
    }
    
    if (!hasValidHtmlStructure(html)) {
      return {
        isUp: false,
        error: 'Invalid HTML structure - missing <html> or <body> tags'
      };
    }
    
    const spaCheck = isSinglePageApp(html);
    
    if (spaCheck.isSPA) {
      return {
        isUp: true,
        message: 'OK (SPA detected)',
        isSPA: true,
        spaIndicators: spaCheck.indicators
      };
    }
    
    if (isEmptyHtml(html)) {
      return {
        isUp: false,
        error: 'Empty HTML - сторінка без контенту (можлива помилка)'
      };
    }
    
    const contentCheck = hasValidContent(html);
    if (!contentCheck.valid) {
      return {
        isUp: false,
        error: contentCheck.reason,
        details: contentCheck.tagCounts
      };
    }
    
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
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return {
      isUp: false,
      error: 'Timeout - сайт не відповідає',
      canRetry: true
    };
  }
  
  if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
    return {
      isUp: false,
      error: 'DNS помилка - домен не знайдено',
      canRetry: false
    };
  }
  
  if (error.code === 'ECONNREFUSED') {
    return {
      isUp: false,
      error: 'З\'єднання відхилено - сервер вимкнений',
      canRetry: false
    };
  }
  
  if (error.code === 'ECONNRESET') {
    return {
      isUp: false,
      error: 'З\'єднання розірвано',
      canRetry: true
    };
  }
  
  if (isSSLError(error)) {
    return {
      isUp: false,
      error: 'SSL сертифікат недійсний або відсутній',
      canRetry: false
    };
  }
  
  if (error.response && error.response.status >= 500) {
    return {
      isUp: false,
      error: `Server error: ${error.response.status}`,
      canRetry: true
    };
  }
  
  return {
    isUp: false,
    error: error.message || 'Невідома помилка',
    canRetry: false
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
  let attemptNumber = 0;

  try {
    while (true) {
      attemptNumber++;
      const startTime = Date.now();
      
      const timeout = attemptNumber === 1 ? CHECK_TIMEOUT_FIRST : CHECK_TIMEOUT_RETRY;
      
      try {
        // Спроба запиту
        const response = await attemptCheck(url, timeout);
        const responseTime = Date.now() - startTime;
        
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
        lastError = { ...errorResult, status: error.response?.status || null, responseTime };
        
        // Отримуємо інфо про retry
        const retryInfo = getRetryInfo(error);
        
        // Якщо не можна retry - повертаємо помилку
        if (!retryInfo.shouldRetry) {
          return lastError;
        }
        
        // Якщо досягли макс. спроб - повертаємо помилку
        if (attemptNumber > retryInfo.maxRetries) {
          return lastError;
        }
        
        // Логування retry
        const errorTypeText = retryInfo.errorType === 'server_error' 
          ? `server error ${error.response?.status}` 
          : retryInfo.errorType;
        
        console.log(`  🔄 ${site.domain} - ${errorTypeText} (спроба ${attemptNumber}/${retryInfo.maxRetries + 1}), повторюю через ${RETRY_DELAY/1000}с...`);
        
        // Чекаємо перед наступною спробою
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
    
  } catch (unexpectedError) {
    console.error(`❌ CRITICAL ERROR in checkSite(${site.domain}):`, unexpectedError);
    
    return {
      isUp: false,
      error: `Critical error: ${unexpectedError.message}`,
      status: null,
      responseTime: 0
    };
  }
}