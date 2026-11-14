import { terms, TERMS_VERSION } from '../data/terms';
import type { Locale } from '../data/i18n';

const HIDDEN_VERSION_KEY = 'alexov_terms_hidden';
const VISITOR_KEY = 'alexov_terms_visitor';
const ACCEPTED_KEY = 'alexov_terms_accepted';
const PENDING_KEY = 'alexov_terms_pending';

function readSetting(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function initTerms(getLocale: () => Locale, getTelegramData: () => string) {
  const dialog = document.querySelector<HTMLDialogElement>('#terms-dialog');
  const accept = document.querySelector<HTMLButtonElement>('#terms-accept');
  const remember = document.querySelector<HTMLInputElement>('#terms-remember');
  const disclosure = document.querySelector<HTMLDetailsElement>('.terms-disclosure');
  const body = document.querySelector<HTMLElement>('.terms-body');
  const shop = document.getElementById('app-protected-content');
  const maintenance = document.getElementById('maintenance-screen');
  if (!dialog || !accept || !remember || !disclosure || !body || !shop) return;
  const telegram = (window as Window & { Telegram?: { WebApp?: {
    isVerticalSwipesEnabled?: boolean;
    isVersionAtLeast?: (version: string) => boolean;
    disableVerticalSwipes?: () => void;
    enableVerticalSwipes?: () => void;
  } } }).Telegram?.WebApp;
  let restoreSwipes = false;
  const events = new AbortController();

  const storedVisitor = readSetting(VISITOR_KEY);
  const visitor = storedVisitor && /^[0-9a-f]{32}$/.test(storedVisitor) ? storedVisitor
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  saveSetting(VISITOR_KEY, visitor);
  // This key controls presentation only. The server derives identity from the Telegram signature.
  const account = new URLSearchParams(getTelegramData()).get('user');
  let preference = TERMS_VERSION + ':browser';
  if (account) {
    try {
      const { id } = JSON.parse(account);
      preference = TERMS_VERSION + ':telegram:' + id;
    } catch {}
  }
  const pendingKey = PENDING_KEY + ':' + preference;
  let syncing = false;

  function localize() {
    const locale = getLocale();
    const copy = terms[locale];
    dialog!.querySelectorAll<HTMLElement>('[data-terms-language]').forEach((section) => {
      section.hidden = section.dataset.termsLanguage !== locale;
    });
    dialog!.querySelectorAll<HTMLElement>('[data-terms-copy]').forEach((element) => {
      const key = element.dataset.termsCopy as 'version' | 'accept' | 'remember' | 'readMore';
      element.textContent = copy[key];
    });
  }

  async function record(action: 'visit' | 'accept', locale: Locale) {
    const initData = getTelegramData();
    const send = (session: string) => fetch('/api/terms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, version: TERMS_VERSION, locale, visitor, initData: session }),
      keepalive: true,
    });
    const response = await send(initData);
    return response.status === 401 && initData ? (await send('')).ok : response.ok;
  }

  async function syncAcceptance(locale: Locale) {
    if (syncing) return;
    syncing = true;
    try {
      if (await record('accept', locale)) saveSetting(pendingKey, '');
    } catch {
      // The local acceptance stays valid. Retry the log when the connection returns.
    } finally {
      syncing = false;
    }
  }

  function retryAcceptance() {
    const locale = readSetting(pendingKey);
    if (locale === 'uk' || locale === 'en') void syncAcceptance(locale);
  }

  function open() {
    if (dialog!.hasAttribute('open')) return;
    shop!.setAttribute('inert', '');
    maintenance?.setAttribute('inert', '');
    document.documentElement.classList.add('terms-locked');
    if (telegram?.isVersionAtLeast?.('7.7') && telegram.disableVerticalSwipes && telegram.isVerticalSwipesEnabled !== false) {
      try { telegram.disableVerticalSwipes(); } catch {}
      restoreSwipes = true;
    }
    remember!.checked = readSetting(HIDDEN_VERSION_KEY) === preference;
    disclosure!.open = false;
    localize();
    if (typeof dialog!.showModal === 'function') dialog!.showModal();
    else {
      dialog!.dataset.fallbackModal = '';
      dialog!.setAttribute('open', '');
      accept!.focus();
    }
    body!.scrollTop = 0;
  }

  document.querySelectorAll('[data-open-terms]').forEach((button) => button.addEventListener('click', open, {signal:events.signal}));
  const localeObserver = new MutationObserver(localize);
  localeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  function dismiss() {
    if (typeof dialog!.close === 'function') dialog!.close();
    else dialog!.removeAttribute('open');
    delete dialog!.dataset.fallbackModal;
    shop!.removeAttribute('inert');
    maintenance?.removeAttribute('inert');
    document.documentElement.classList.remove('terms-locked');
    if (restoreSwipes) { try { telegram?.enableVerticalSwipes?.(); } catch {} }
    restoreSwipes = false;
  }
  dialog.addEventListener('cancel', (event) => event.preventDefault(), {signal:events.signal});
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
    }
  }, {signal:events.signal});
  accept.addEventListener('click', () => {
    const locale = getLocale();
    saveSetting(ACCEPTED_KEY + ':' + preference, new Date().toISOString());
    saveSetting(HIDDEN_VERSION_KEY, remember.checked ? preference : '');
    saveSetting(pendingKey, locale);
    dismiss();
    void syncAcceptance(locale);
  }, {signal:events.signal});

  window.addEventListener('online', retryAcceptance, {signal:events.signal});
  document.addEventListener('astro:before-swap',()=>{events.abort();localeObserver.disconnect();dismiss();},{once:true});
  retryAcceptance();
  void record('visit', getLocale()).catch(() => {});
  if (readSetting(HIDDEN_VERSION_KEY) === preference && readSetting(ACCEPTED_KEY + ':' + preference)) {
    shop.removeAttribute('inert');
  } else {
    open();
  }
}
