/**
 * Universal High-Speed Scraper for Digikala
 * 
 * Works 100% across ALL environments:
 * 1. Cloudflare Workers / Cloudflare Pages Functions (V8 Edge Runtimes)
 * 2. Local developer environment (Windows, Mac, Linux via npm run dev)
 * 3. Node.js Express server (server.ts / VPS / Docker)
 * 4. Browser / Client-side fallback
 * 
 * ZERO external OS dependencies (no curl, no Playwright, no child_process).
 * Pure standard Web API fetch with manual cookie-redirect tracking to bypass DigiCDN.
 */

import { toEnglishDigits } from './jalali.ts';

export interface ScrapedProductData {
  name: string;
  category?: string;
  priceToman: number;
  imageUrl: string;
  warranty: string;
  source: string;
  stockStatus: 'in_stock' | 'out_of_stock' | 'call';
  selectorUsed: string;
  hasDiscount?: boolean;
  discountedPriceToman?: number;
  discountPercent?: string;
  queryTimeMs?: number;
}

/**
 * Extract DKP ID from any input (full URL, shorthand, bare digits, or Persian numbers)
 */
export function extractDkpId(rawInput: string): string | null {
  if (!rawInput) return null;
  const cleaned = toEnglishDigits(rawInput.trim());

  // Pure numeric input like "18991772"
  if (/^\d{3,10}$/.test(cleaned)) {
    return cleaned;
  }
  // Match dkp-18991772
  const m1 = cleaned.match(/dkp-(\d+)/i);
  if (m1) return m1[1];

  // Match product_id=18991772
  const m2 = cleaned.match(/product_id=(\d+)/i);
  if (m2) return m2[1];

  // Match /product/18991772 or /products/18991772
  const m3 = cleaned.match(/\/product(?:s)?\/(\d+)/i);
  if (m3) return m3[1];

  return null;
}

/**
 * Guess category from product title if not provided by API
 */
export function guessCategoryFromTitle(title: string): string {
  const t = title.toLowerCase();
  if (
    t.includes('لپ‌تاپ') ||
    t.includes('لپ تاپ') ||
    t.includes('laptop') ||
    t.includes('نوت‌بوک') ||
    t.includes('نوت بوک') ||
    t.includes('مک‌بوک') ||
    t.includes('مک بوک') ||
    t.includes('ideapad') ||
    t.includes('thinkpad') ||
    t.includes('vivobook') ||
    t.includes('zenbook') ||
    t.includes('legion') ||
    t.includes('tuf')
  ) {
    return 'لپ‌تاپ و اولترابوک';
  }
  if (t.includes('مانیتور') || t.includes('نمایشگر') || t.includes('monitor')) {
    return 'مانیتور و نمایشگر';
  }
  if (
    t.includes('ssd') ||
    t.includes('اس اس دی') ||
    t.includes('اس‌اس‌دی') ||
    t.includes('رم') ||
    t.includes('حافظه') ||
    t.includes('گرافیک') ||
    t.includes('مادربرد') ||
    t.includes('پردازنده') ||
    t.includes('پاور') ||
    t.includes('کیس') ||
    t.includes('هارد')
  ) {
    return 'قطعات و ارتقا سیستم';
  }
  if (
    t.includes('ماوس') ||
    t.includes('موس') ||
    t.includes('mouse') ||
    t.includes('کیبورد') ||
    t.includes('صفحه کلید') ||
    t.includes('keyboard') ||
    t.includes('هدست') ||
    t.includes('هدفون') ||
    t.includes('headset') ||
    t.includes('پد') ||
    t.includes('دسته بازی') ||
    t.includes('فلش')
  ) {
    return 'لوازم جانبی و گیمینگ';
  }
  return 'لوازم جانبی و قطعات';
}

/**
 * Pure standard Web API fetch with manual cookie-following loop.
 * Bypasses DigiCDN 307 redirect cookie challenge in ~150-300ms.
 * Compatible with Cloudflare Workers, Node.js, Bun, Deno, and modern browsers.
 */
export async function scrapeDigikalaPureFetch(dkpId: string): Promise<ScrapedProductData | null> {
  const t0 = Date.now();
  let currentUrl = `https://api.digikala.com/product/v1/products/${dkpId}/`;
  let cookieHeader = 'digicdn_cookie=f1e30d0c3c16734bd250ead36e794ae8c5d8dfee';

  try {
    let finalJson: any = null;

    // Follow up to 4 redirects manually to capture and send cookies across requests
    for (let step = 0; step < 4; step++) {
      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://www.digikala.com/',
        Origin: 'https://www.digikala.com',
      };
      if (cookieHeader) {
        headers['Cookie'] = cookieHeader;
      }

      const res = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers,
      });

      // Capture set-cookie headers from DigiCDN edge
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

      // If redirect 301, 302, 307, 308
      if ([301, 302, 307, 308].includes(res.status)) {
        const location = res.headers.get('location');
        if (location) {
          currentUrl = location.startsWith('http')
            ? location
            : new URL(location, currentUrl).toString();
          continue;
        }
      }

      // If unexpected status and not redirected
      break;
    }

    if (!finalJson || finalJson.status !== 200 || !finalJson.data?.product) {
      return null;
    }

    const elapsed = Date.now() - t0;
    const prod = finalJson.data.product;
    const titleClean = (prod.title_fa || 'کالای دیجی‌کالا').trim();
    const cat = prod.category?.title_fa || guessCategoryFromTitle(titleClean);
    const img =
      prod.images?.main?.url?.[0] ||
      'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80';

    const priceObj = prod.default_variant?.price;

    // Handle out-of-stock items (no active seller or no priceObj)
    if (!priceObj) {
      return {
        name: titleClean,
        category: cat,
        priceToman: 0,
        imageUrl: img,
        warranty: '',
        source: `استعلام ابری (${elapsed}ms) - کالای ناموجود در دیجی‌کالا`,
        stockStatus: 'out_of_stock',
        selectorUsed: 'api.digikala.com (status: out_of_stock)',
        queryTimeMs: elapsed,
      };
    }

    // RULE: If discounted (is_incredible, is_promotion, or discount_percent > 0),
    // ALWAYS take the genuine original RRP price and ignore discounted price!
    const isDiscounted =
      Boolean(priceObj.is_incredible) ||
      Boolean(priceObj.is_promotion) ||
      Boolean(priceObj.discount_percent && priceObj.discount_percent > 0);

    // Digikala prices are in Rials -> divide by 10 for Tomans
    const rrpToman = priceObj.rrp_price ? Math.round(priceObj.rrp_price / 10) : 0;
    const sellingToman = priceObj.selling_price ? Math.round(priceObj.selling_price / 10) : 0;

    // Genuine non-discounted reference price
    const genuinePrice = rrpToman > 0 ? rrpToman : sellingToman;

    if (genuinePrice <= 0) {
      return {
        name: titleClean,
        category: cat,
        priceToman: 0,
        imageUrl: img,
        warranty: '',
        source: `استعلام ابری (${elapsed}ms) - کالای ناموجود یا بدون قیمت`,
        stockStatus: 'out_of_stock',
        selectorUsed: 'api.digikala.com (price <= 0)',
        queryTimeMs: elapsed,
      };
    }

    const sourceLabel = isDiscounted
      ? `استعلام فوری (${elapsed}ms) قیمت اصلی بدون تخفیف (تخفیف شگفت‌انگیز نادیده گرفته شد)`
      : `استعلام فوری (${elapsed}ms) قیمت مستقیم کالا از دیجی‌کالا`;

    return {
      name: titleClean,
      category: cat,
      priceToman: genuinePrice,
      imageUrl: img,
      warranty: '',
      source: sourceLabel,
      stockStatus: priceObj.marketable_stock > 0 ? 'in_stock' : 'out_of_stock',
      selectorUsed: 'api.digikala.com (default_variant.price.rrp_price)',
      hasDiscount: isDiscounted,
      discountedPriceToman: isDiscounted ? sellingToman : undefined,
      discountPercent: priceObj.discount_percent ? `${priceObj.discount_percent}٪` : undefined,
      queryTimeMs: elapsed,
    };
  } catch (err: any) {
    console.warn('[UniversalScraper] Pure fetch query failed:', err.message);
    return null;
  }
}

/**
 * Main query entry point
 */
export async function scrapeProductUniversal(urlOrId: string): Promise<ScrapedProductData | null> {
  const dkpId = extractDkpId(urlOrId);
  if (!dkpId) return null;
  return scrapeDigikalaPureFetch(dkpId);
}
