import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPriceFromDigikalaInspect } from './digikalaScraper.ts';

test('extractPriceFromDigikalaInspect parses exact DevTools snippet from user image', () => {
  // Exact snippet from screenshot:
  const snippet = `<div class="flex flex-row items-center" data-theme-animation="price-container">
  <span class="ml-1 text-neutral-800" data-testid="price-final">
    <div>۴,۱۶۵,۰۰۰</div>
  </span>
  <dds-icon name="value-toman" color="content/1" aria-hidden="true" style="font-size: 14px;"></dds-icon>
</div>`;

  const result = extractPriceFromDigikalaInspect(snippet);
  assert.notEqual(result, null);
  assert.equal(result?.priceToman, 4165000);
  assert.equal(result?.sourceType, 'data-testid-price-final');
});

test('extractPriceFromDigikalaInspect parses span with data-testid="price-final"', () => {
  const span = `<span class="ml-1 text-neutral-800" data-testid="price-final"><div>۴,۱۶۵,۰۰۰</div></span>`;
  const result = extractPriceFromDigikalaInspect(span);
  assert.notEqual(result, null);
  assert.equal(result?.priceToman, 4165000);
});

test('extractPriceFromDigikalaInspect parses raw pasted Persian digits with commas', () => {
  const raw = '۴,۱۶۵,۰۰۰';
  const result = extractPriceFromDigikalaInspect(raw);
  assert.notEqual(result, null);
  assert.equal(result?.priceToman, 4165000);
});

test('extractPriceFromDigikalaInspect parses English digits with commas', () => {
  const raw = '4,165,000';
  const result = extractPriceFromDigikalaInspect(raw);
  assert.notEqual(result, null);
  assert.equal(result?.priceToman, 4165000);
});
