/**
 * Cloudflare Pages Advanced Mode Worker (_worker.js)
 * 
 * Vite automatically copies everything in public/ directly into dist/.
 * When deploying dist/ to Cloudflare Pages (via drag & drop folder or zip, or wrangler pages deploy),
 * this _worker.js intercepts all /api/* requests and executes them as high-speed Edge Workers!
 * For any other route, it seamlessly serves the static Vite frontend (env.ASSETS).
 */

function toEnglishDigits(str) {
  if (!str) return '';
  return String(str)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

function extractDkpId(rawInput) {
  if (!rawInput) return null;
  const cleaned = toEnglishDigits(String(rawInput).trim());
  if (/^\d{3,10}$/.test(cleaned)) return cleaned;
  const m1 = cleaned.match(/dkp-(\d+)/i);
  if (m1) return m1[1];
  const m2 = cleaned.match(/product_id=(\d+)/i);
  if (m2) return m2[1];
  const m3 = cleaned.match(/\/product(?:s)?\/(\d+)/i);
  if (m3) return m3[1];
  return null;
}

function guessCategory(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('لپ‌تاپ') || t.includes('لپ تاپ') || t.includes('laptop')) return 'لپ‌تاپ و اولترابوک';
  if (t.includes('مانیتور') || t.includes('نمایشگر') || t.includes('monitor')) return 'مانیتور و نمایشگر';
  if (t.includes('ssd') || t.includes('اس اس دی') || t.includes('رم') || t.includes('گرافیک')) return 'قطعات و ارتقا سیستم';
  if (t.includes('ماوس') || t.includes('موس') || t.includes('کیبورد') || t.includes('هدست')) return 'لوازم جانبی و گیمینگ';
  return 'لوازم جانبی و قطعات';
}

const DEFAULT_PRODUCTS = [
  {
    id: 'prod_lenovo_ideapad_1',
    name: 'لپ‌تاپ لنوو مدل IdeaPad 1 15IJL7 با پردازنده Celeron N4500، رم DDR4 8GB، حافظه SSD 256GB، نمایشگر 15.6 اینچ Full HD',
    category: 'لپ‌تاپ و اولترابوک',
    sourceUrl: 'https://www.digikala.com/product/dkp-18991772/',
    imageUrl: 'https://dkstatics-public.digikala.com/digikala-products/509ef6a33068c0d055e624baf07569faa72ea082_1786538650.jpg?x-oss-process=image/resize,m_lfit,h_800,w_800/quality,q_90',
    currentPriceToman: 89000000,
    lastPriceToman: 89000000,
    marginPercent: 0,
    customerQuoteToman: 89000000,
    stockStatus: 'in_stock',
    warranty: '',
    lastRefreshedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    notes: 'پرفروش‌ترین لپ‌تاپ اقتصادی با قیمت اصلی بدون بیمه',
  },
  {
    id: 'prod_t2_gaming_mouse',
    name: 'ماوس بی سیم گیمینگ مدل T2',
    category: 'لوازم جانبی و گیمینگ',
    sourceUrl: 'https://www.digikala.com/product/dkp-20717228/',
    imageUrl: 'https://dkstatics-public.digikala.com/digikala-products/e575af4ee6bdc77e88284fa977c39480bbacf27d_1760876748.jpg?x-oss-process=image/resize,m_lfit,h_800,w_800/quality,q_90',
    currentPriceToman: 2350000,
    lastPriceToman: 2350000,
    marginPercent: 0,
    customerQuoteToman: 2350000,
    stockStatus: 'in_stock',
    warranty: '',
    lastRefreshedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    notes: 'ماوس با تخفیف شگفت‌انگیز که قیمت اصلی ۲,۳۵۰,۰۰۰ تومان ثبت شده است',
  },
  {
    id: 'prod_samsung_ssd_980pro',
    name: 'حافظه اس‌اس‌دی سامسونگ مدل 980 PRO PCIe 4.0 NVMe M.2 ظرفیت 1 ترابایت',
    category: 'قطعات و ارتقا سیستم',
    sourceUrl: 'https://www.digikala.com/product/dkp-4820194/',
    imageUrl: 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?auto=format&fit=crop&w=600&q=80',
    currentPriceToman: 5450000,
    lastPriceToman: 5300000,
    marginPercent: 0,
    customerQuoteToman: 5450000,
    stockStatus: 'in_stock',
    warranty: '',
    lastRefreshedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    notes: 'قطعه اصلی برای ارتقای لپ‌تاپ‌های مغازه',
  },
  {
    id: 'prod_xiaomi_monitor_27',
    name: 'مانیتور گیمینگ ۲۷ اینچ شیائومی مدل Redmi G27 با نرخ نوسازی 165Hz IPS',
    category: 'مانیتور و نمایشگر',
    sourceUrl: 'https://www.digikala.com/product/dkp-9302148/',
    imageUrl: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=600&q=80',
    currentPriceToman: 9800000,
    lastPriceToman: 9400000,
    marginPercent: 0,
    customerQuoteToman: 9800000,
    stockStatus: 'in_stock',
    warranty: '',
    lastRefreshedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    notes: 'مانیتور گیمینگ با ووضوح بالا',
  },
];

async function fetchDigikalaProductFromEdge(dkpId) {
  const endpoints = [
    `https://api.digikala.com/product/v1/products/${dkpId}/`,
    `https://api.digikala.com/v2/product/${dkpId}/`,
  ];

  let cookieHeader = 'digicdn_cookie=f1e30d0c3c16734bd250ead36e794ae8c5d8dfee';
  let lastStatus = 0;
  let lastError = '';

  for (const endpoint of endpoints) {
    let currentUrl = endpoint;
    for (let step = 0; step < 3; step++) {
      try {
        const headers = {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
          Referer: 'https://www.digikala.com/',
        };
        if (cookieHeader) headers['Cookie'] = cookieHeader;

        const res = await fetch(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          headers,
        });

        lastStatus = res.status;

        // Extract cookies
        let setCookieList = [];
        if (typeof res.headers.getSetCookie === 'function') {
          setCookieList = res.headers.getSetCookie();
        } else if (res.headers.get('set-cookie')) {
          setCookieList = [res.headers.get('set-cookie')];
        }

        if (setCookieList && setCookieList.length > 0) {
          const pairs = setCookieList
            .map((c) => c.split(';')[0].trim())
            .filter(Boolean);
          if (pairs.length > 0) {
            cookieHeader = pairs.join('; ');
          }
        }

        if (res.status === 200) {
          const json = await res.json();
          if (json && (json.status === 200 || json.data?.product)) {
            return { json, endpointUsed: currentUrl };
          }
        }

        if ([301, 302, 307, 308].includes(res.status)) {
          const location = res.headers.get('location');
          if (location) {
            currentUrl = location.startsWith('http')
              ? location
              : new URL(location, currentUrl).toString();
            continue;
          }
        }
        break;
      } catch (err) {
        lastError = err.message;
        break;
      }
    }
  }

  return { json: null, lastStatus, lastError };
}

const KV_BUNDLE_KEY = 'shop_bundle_v1';
const KV_PIN_KEY = 'shop_pin_auth_v1';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Shop-Pin',
    'Access-Control-Allow-Private-Network': 'true',
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateSaltHex() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function resolveShopKv(env) {
  if (!env || typeof env !== 'object') {
    return { kv: null, bindingName: null };
  }
  const preferred = env.SHOP_KV;
  if (preferred && typeof preferred.get === 'function' && typeof preferred.put === 'function') {
    return { kv: preferred, bindingName: 'SHOP_KV' };
  }
  for (const [key, val] of Object.entries(env)) {
    if (val && typeof val === 'object' && typeof val.get === 'function' && typeof val.put === 'function') {
      return { kv: val, bindingName: key };
    }
  }
  return { kv: null, bindingName: null };
}

function getFallbackShopPin(env) {
  const configured = env && env.SHOP_PIN ? String(env.SHOP_PIN).trim() : '';
  return configured || '1405';
}

async function isPinAuthorized(request, env, bodyPin) {
  const provided = String(
    bodyPin || request.headers.get('X-Shop-Pin') || request.headers.get('x-shop-pin') || ''
  ).trim();
  if (!provided) return false;

  const { kv } = resolveShopKv(env);
  if (kv) {
    try {
      const authRecord = await kv.get(KV_PIN_KEY, { type: 'json' });
      if (authRecord && authRecord.salt && authRecord.hash) {
        const candidateHash = await sha256Hex(`${authRecord.salt}:${provided}`);
        return candidateHash === authRecord.hash;
      }
    } catch {
      // Fall through to env/initial PIN check
    }
  }

  const expected = getFallbackShopPin(env);
  return provided === expected;
}

function normalizeBundle(raw) {
  const products = Array.isArray(raw?.products) ? raw.products : [];
  const histories = raw?.histories && typeof raw.histories === 'object' ? raw.histories : {};
  const deletedIds = raw?.deletedIds && typeof raw.deletedIds === 'object' ? raw.deletedIds : {};
  return {
    version: 1,
    exportedAt: typeof raw?.exportedAt === 'string' ? raw.exportedAt : new Date().toISOString(),
    source: 'cloudflare-kv',
    products,
    histories,
    deletedIds,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // 0. API Health & Status check: GET /api/track-url
    if (url.pathname === '/api/track-url' && request.method === 'GET') {
      const { kv, bindingName } = resolveShopKv(env);
      return jsonResponse({
        success: true,
        status: 'online',
        message: 'ورکر ابری کلادفلر (_worker.js) با موفقیت فعال و آماده پاسخگویی است',
        environment: 'Cloudflare Pages Advanced Worker',
        kvConfigured: Boolean(kv),
        kvBindingName: bindingName,
        timestamp: new Date().toISOString(),
      });
    }

    // 0.1 Cloudflare KV & Shop PIN status check
    if (url.pathname === '/api/kv/status' && request.method === 'GET') {
      const { kv, bindingName } = resolveShopKv(env);
      return jsonResponse({
        success: true,
        available: true,
        kvConfigured: Boolean(kv),
        kvBindingName: bindingName,
        requiresPin: true,
        environment: 'Cloudflare Pages Edge',
        timestamp: new Date().toISOString(),
      });
    }

    // 0.2 Verify Shop PIN
    if (url.pathname === '/api/kv/verify-pin' && request.method === 'POST') {
      const { kv, bindingName } = resolveShopKv(env);
      const body = await request.json().catch(() => ({}));
      const ok = await isPinAuthorized(request, env, body?.pin);
      if (!ok) {
        return jsonResponse(
          {
            success: false,
            error: 'رمز فروشگاه نادرست است. لطفاً دوباره بررسی کنید.',
          },
          401
        );
      }
      return jsonResponse({
        success: true,
        kvConfigured: Boolean(kv),
        kvBindingName: bindingName,
      });
    }

    // 0.25 Change Shop PIN (stored as salted SHA-256 hash in KV)
    if (url.pathname === '/api/kv/change-pin' && request.method === 'POST') {
      const { kv } = resolveShopKv(env);
      const body = await request.json().catch(() => ({}));
      const currentPin = String(body?.currentPin || '').trim();
      const newPin = String(body?.newPin || '').trim();

      if (!kv) {
        return jsonResponse(
          {
            success: false,
            error:
              'برای ذخیره دائمی رمز جدید، ابتدا فضای Cloudflare KV را در بخش Settings -> Bindings پروژه متصل کنید.',
          },
          400
        );
      }

      const ok = await isPinAuthorized(request, env, currentPin);
      if (!ok) {
        return jsonResponse({ success: false, error: 'رمز فعلی فروشگاه نادرست است.' }, 401);
      }

      if (newPin.length < 4 || newPin.length > 64) {
        return jsonResponse(
          { success: false, error: 'رمز جدید باید حداقل ۴ و حداکثر ۶۴ کاراکتر باشد.' },
          400
        );
      }

      try {
        const salt = generateSaltHex();
        const hash = await sha256Hex(`${salt}:${newPin}`);
        await kv.put(
          KV_PIN_KEY,
          JSON.stringify({
            salt,
            hash,
            updatedAt: new Date().toISOString(),
          })
        );
        return jsonResponse({
          success: true,
          message: 'رمز فروشگاه با موفقیت تغییر یافت و در کلادفلر ذخیره شد.',
        });
      } catch (err) {
        return jsonResponse(
          { success: false, error: err?.message || 'خطا در ذخیره رمز جدید در کلادفلر KV' },
          500
        );
      }
    }

    // 0.3 Get Shop Bundle from Cloudflare KV
    if (url.pathname === '/api/kv/bundle' && request.method === 'GET') {
      if (!(await isPinAuthorized(request, env))) {
        return jsonResponse({ success: false, error: 'احراز هویت با رمز فروشگاه الزامی است' }, 401);
      }
      const { kv, bindingName } = resolveShopKv(env);
      if (!kv) {
        return jsonResponse({
          success: true,
          kvConfigured: false,
          kvBindingName: null,
          setupRequired: true,
          bundle: null,
        });
      }
      try {
        const stored = await kv.get(KV_BUNDLE_KEY, { type: 'json' });
        return jsonResponse({
          success: true,
          kvConfigured: true,
          kvBindingName: bindingName,
          setupRequired: false,
          bundle: stored ? normalizeBundle(stored) : null,
        });
      } catch (err) {
        return jsonResponse(
          {
            success: false,
            kvConfigured: true,
            kvBindingName: bindingName,
            error: err?.message || 'خطا در خواندن از Cloudflare KV',
          },
          500
        );
      }
    }

    // 0.4 Save Shop Bundle to Cloudflare KV
    if (url.pathname === '/api/kv/bundle' && request.method === 'PUT') {
      if (!(await isPinAuthorized(request, env))) {
        return jsonResponse({ success: false, error: 'احراز هویت با رمز فروشگاه الزامی است' }, 401);
      }
      const { kv, bindingName } = resolveShopKv(env);
      if (!kv) {
        return jsonResponse({
          success: false,
          kvConfigured: false,
          kvBindingName: null,
          setupRequired: true,
          bundle: null,
          error: 'حافظه Cloudflare KV در تنظیمات Bindings پروژه (Production/Preview) متصل نشده است.',
        });
      }
      try {
        const body = await request.json().catch(() => ({}));
        const normalized = normalizeBundle(body);
        normalized.exportedAt = new Date().toISOString();
        normalized.source = 'cloudflare-kv';
        await kv.put(KV_BUNDLE_KEY, JSON.stringify(normalized));
        return jsonResponse({
          success: true,
          kvConfigured: true,
          kvBindingName: bindingName,
          bundle: normalized,
        });
      } catch (err) {
        return jsonResponse(
          {
            success: false,
            kvConfigured: true,
            kvBindingName: bindingName,
            error: err?.message || 'خطا در ذخیره‌سازی در Cloudflare KV',
          },
          500
        );
      }
    }

    // 1. API: POST /api/track-url
    if (url.pathname === '/api/track-url' && request.method === 'POST') {
      const t0 = Date.now();
      try {
        const { kv } = resolveShopKv(env);
        const body = await request.json().catch(() => ({}));
        if (body?.ping) {
          return jsonResponse({
            success: true,
            status: 'online',
            kvConfigured: Boolean(kv),
            message: 'ورکر کلادفلر فعال و آماده استعلام است',
          });
        }
        const inputUrl = body?.url || '';

        const dkpId = extractDkpId(inputUrl);
        if (!dkpId) {
          return jsonResponse(
            {
              success: false,
              error: 'شناسه یا آدرس معتبر دیجی‌کالا یافت نشد (مثال: dkp-20176433 یا لینک کالا)',
            },
            400
          );
        }

        const { json: finalJson, lastStatus, lastError } = await fetchDigikalaProductFromEdge(dkpId);

        if (!finalJson || !finalJson.data?.product) {
          const detail = lastStatus > 0 ? `کد پاسخ: ${lastStatus}` : (lastError || 'عدم دسترسی');
          return jsonResponse(
            {
              success: false,
              error: `کالای مورد نظر در دیجی‌کالا یافت نشد یا دسترسی مسدود است (${detail})`,
              debug: { dkpId, lastStatus, lastError },
            },
            404
          );
        }

        const elapsed = Date.now() - t0;
        const prod = finalJson.data.product;
        const titleClean = (prod.title_fa || 'کالای دیجی‌کالا').trim();
        const cat = prod.category?.title_fa || guessCategory(titleClean);
        const img =
          prod.images?.main?.url?.[0] ||
          'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80';

        const priceObj = prod.default_variant?.price;

        if (!priceObj) {
          return jsonResponse({
            success: true,
            data: {
              name: titleClean,
              category: cat,
              priceToman: 0,
              imageUrl: img,
              warranty: '',
              source: `استعلام لبه کلادفلر (${elapsed}ms) - کالای ناموجود`,
              stockStatus: 'out_of_stock',
              selectorUsed: 'api.digikala.com (status: out_of_stock)',
              queryTimeMs: elapsed,
            },
          });
        }

        const isDiscounted =
          Boolean(priceObj.is_incredible) ||
          Boolean(priceObj.is_promotion) ||
          Boolean(priceObj.discount_percent && priceObj.discount_percent > 0);

        const rrpToman = priceObj.rrp_price ? Math.round(priceObj.rrp_price / 10) : 0;
        const sellingToman = priceObj.selling_price ? Math.round(priceObj.selling_price / 10) : 0;
        const genuinePrice = rrpToman > 0 ? rrpToman : sellingToman;

        return jsonResponse({
          success: true,
          data: {
            name: titleClean,
            category: cat,
            priceToman: genuinePrice,
            imageUrl: img,
            warranty: '',
            source: isDiscounted
              ? `استعلام ابری کلادفلر (${elapsed}ms) قیمت اصلی بدون تخفیف`
              : `استعلام ابری کلادفلر (${elapsed}ms) قیمت مستقیم کالا`,
            stockStatus: priceObj.marketable_stock > 0 ? 'in_stock' : 'out_of_stock',
            selectorUsed: 'api.digikala.com (Cloudflare Pages Edge Worker)',
            hasDiscount: isDiscounted,
            discountedPriceToman: isDiscounted ? sellingToman : undefined,
            discountPercent: priceObj.discount_percent ? `${priceObj.discount_percent}٪` : undefined,
            queryTimeMs: elapsed,
          },
        });
      } catch (err) {
        return jsonResponse(
          {
            success: false,
            error: err.message || 'خطا در اجرای استعلام کلادفلر',
          },
          500
        );
      }
    }

    // 2. API: GET /api/products
    if (url.pathname === '/api/products' && request.method === 'GET') {
      return jsonResponse({
        success: true,
        products: DEFAULT_PRODUCTS,
      });
    }

    // 3. API: POST /api/products
    if (url.pathname === '/api/products' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const margin = Number(body.marginPercent ?? 8);
        const price = Number(body.currentPriceToman) || 0;
        const newProd = {
          id: body.id || `prod_${Date.now()}`,
          name: body.name || 'کالای جدید',
          category: body.category || 'لوازم جانبی و قطعات',
          sourceUrl: body.sourceUrl || '',
          imageUrl:
            body.imageUrl ||
            'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
          currentPriceToman: price,
          lastPriceToman: price,
          marginPercent: Number.isFinite(margin) ? margin : 8,
          customerQuoteToman:
            Number(body.customerQuoteToman) ||
            Math.round((price * (1 + (Number.isFinite(margin) ? margin : 8) / 100)) / 1000) * 1000,
          stockStatus: body.stockStatus || 'in_stock',
          warranty: '',
          lastRefreshedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          notes: body.notes || '',
        };

        return jsonResponse({
          success: true,
          product: newProd,
        });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // 3.5 API: DELETE /api/products/:id
    if (url.pathname.startsWith('/api/products/') && request.method === 'DELETE') {
      return jsonResponse({
        success: true,
        message: 'کالا با موفقیت حذف شد',
      });
    }

    // 4. API: GET /api/scheduler/status
    if (url.pathname.startsWith('/api/scheduler')) {
      const now = new Date();
      const nextHour = (Math.floor(now.getHours() / 3) + 1) * 3;
      return jsonResponse({
        success: true,
        intervalHours: 3,
        scheduleTimes: ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00'],
        nextScheduledTime: `ساعت ${String(nextHour % 24).padStart(2, '0')}:00`,
        lastRunTime: 'پایش فعال',
        lastRunStatus: 'موفق',
        lastRunCount: 4,
        totalTrackedProducts: 4,
        isAutoSyncEnabled: true,
        environment: 'Cloudflare Pages Edge',
      });
    }

    // 5. Default: Serve static SPA assets from Vite build
    if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};

