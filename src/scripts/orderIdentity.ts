const BROWSER_KEY = 'alexov_order_browser';

export function newOrderKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function orderBrowserKey() {
  try {
    const stored = localStorage.getItem(BROWSER_KEY);
    if (stored && /^[0-9a-f]{32}$/.test(stored)) return stored;
  } catch {}
  const key = newOrderKey();
  try {
    localStorage.setItem(BROWSER_KEY, key);
  } catch {}
  return key;
}
