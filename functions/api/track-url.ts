/**
 * Cloudflare Pages Function for /api/track-url
 * Runs directly on Cloudflare Edge (Workers V8 runtime) with 0 latency.
 */

// Helper to convert Persian/Arabic digits
function toEnglishDigits(str: string): string {
  if (!str) return '';
  return str
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

function extractDkpId(rawInput: string): string | null {
  if (!rawInput) return null;
  const cleaned = toEnglishDigits(rawInput.trim());
  if (/^\d{3,10}$/.test(cleaned)) return cleaned;
  const m1 = cleaned.match(/dkp-(\d+)/i);
  if (m1) return m1[1];
  const m2 = cleaned.match(/product_id=(\d+)/i);
  if (m2) return m2[1];
  const m3 = cleaned.match(/\/product(?:s)?\/(\d+)/i);
  if (m3) return m3[1];
  return null;
}

function guessCategory(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('لپ‌تاپ') || t.includes('لپ تاپ') || t.includes('laptop')) return 'لپ‌تاپ و اولترابوک';
  if (t.includes('مانیتور') || t.includes('نمایشگر') || t.includes('monitor')) return 'مانیتور و نمایشگر';
  if (t.includes('ssd') || t.includes('اس اس دی') || t.includes('رم') || t.includes('گرافیک')) return 'قطعات و ارتقا سیستم';
  if (t.includes('ماوس') || t.includes('موس') || t.includes('کیبورد') || t.includes('هدست')) return 'لوازم جانبی و گیمینگ';
  return 'لوازم جانبی و قطعات';
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function onRequestPost(context: any) {
  const t0 = Date.now();
  try {
    const body: any = await context.request.json();
    const url = body?.url || '';

    const dkpId = extractDkpId(url);
    if (!dkpId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'شناسه یا آدرس معتبر دیجی‌کالا یافت نشد',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Follow redirects with pre-set session cookie
    let currentUrl = `https://api.digikala.com/product/v1/products/${dkpId}/`;
    let cookieHeader = 'digicdn_cookie=f1e30d0c3c16734bd250ead36e794ae8c5d8dfee';
    let finalJson: any = null;

    for (let step = 0; step < 4; step++) {
      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://www.digikala.com/',
        Origin: 'https://www.digikala.com',
      };
      if (cookieHeader) headers['Cookie'] = cookieHeader;

      const res = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers,
      });

      let setCookieList: string[] = [];
      // @ts-ignore
      if (typeof res.headers.getSetCookie === 'function') {
        // @ts-ignore
        setCookieList = res.headers.getSetCookie();
      } else if (res.headers.get('set-cookie')) {
        setCookieList = [res.headers.get('set-cookie') as string];
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
        finalJson = await res.json();
        break;
      }

      if ([301, 302, 307, 308].includes(res.status)) {
        const location = res.headers.get('location');
        if (location) {
          currentUrl = location.startsWith('http') ? location : new URL(location, currentUrl).toString();
          continue;
        }
      }
      break;
    }

    if (!finalJson || finalJson.status !== 200 || !finalJson.data?.product) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'اطلاعات کالا از دیجی‌کالا دریافت نشد',
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
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
      return new Response(
        JSON.stringify({
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
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const isDiscounted =
      Boolean(priceObj.is_incredible) ||
      Boolean(priceObj.is_promotion) ||
      Boolean(priceObj.discount_percent && priceObj.discount_percent > 0);

    const rrpToman = priceObj.rrp_price ? Math.round(priceObj.rrp_price / 10) : 0;
    const sellingToman = priceObj.selling_price ? Math.round(priceObj.selling_price / 10) : 0;
    const genuinePrice = rrpToman > 0 ? rrpToman : sellingToman;

    return new Response(
      JSON.stringify({
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
          selectorUsed: 'api.digikala.com (Cloudflare Pages Edge Function)',
          hasDiscount: isDiscounted,
          discountedPriceToman: isDiscounted ? sellingToman : undefined,
          discountPercent: priceObj.discount_percent ? `${priceObj.discount_percent}٪` : undefined,
          queryTimeMs: elapsed,
        },
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'خطا در اجرای تابع کلادفلر',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
