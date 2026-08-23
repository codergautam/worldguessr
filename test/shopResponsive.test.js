import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SHOP = readFileSync(
  fileURLToPath(new URL('../styles/shop.css', import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

function rulesFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...SHOP.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))]
    .map((match) => match[1]);
}

describe('the mobile shop wallet', () => {
  it('keeps the full stamp balance on one line', () => {
    const valueRule = rulesFor('.shopWallet__value')[0];
    const mobileHeaderRule = rulesFor('.shopHeader')
      .find((rule) => rule.includes('minmax(max-content, 1fr)'));
    const mobileWalletRule = rulesFor('.shopWallet')
      .find((rule) => rule.includes('max-width: none'));

    expect(valueRule).toContain('white-space: nowrap');
    expect(mobileHeaderRule).toBeDefined();
    expect(mobileWalletRule).toContain('min-width: max-content');
  });
});
