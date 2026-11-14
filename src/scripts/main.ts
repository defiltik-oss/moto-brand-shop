import { initNavigationDrawer } from './navigationDrawer';
import { initRoleShop } from './roleShop';
import { createRoleBadge, type ShopRole } from './roleBadge';
import { newOrderKey, orderBrowserKey } from './orderIdentity';
import { initTerms } from './terms';
import { initGlass } from './glass';
import { translations, type Locale } from '../data/i18n';
import { findCatalogProduct, refreshCatalog, refreshSubscribers, renderCatalog } from './catalog';
import { watchCatalogAdmin } from './catalogAdmin';
import {
  resolveDiscordRoleStyle,
  parseTagsList,
  ACHIEVEMENTS_CATALOG,
  type AchievementDef,
} from '../data/gamification';

const STORAGE_THEME = 'alexov_theme_v5';
const STORAGE_PERF = 'alexov_perf_mode_v5';
const STORAGE_LANG = 'alexov_lang_v6';

export interface UserProfileRecord {
  id: number | string;
  telegram_id?: string;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  languageCode?: string;
  tokens: number;
  jetPeak?: number;
  frameId?: string;
  frameColor?: string;
  xp: number;
  level: number;
  roles?: string;
  ownedRoles?: ShopRole[];
  activeRole?: ShopRole | null;
  tags?: string;
  rankTitleUk: string;
  rankTitleEn: string;
  rewards: string[];
  ordersCount: number;
  isAdmin?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
}

let currentLocale: Locale = 'uk';
let currentUserProfile: UserProfileRecord | null = null;
let serverMaintenanceEnabled = false;

function getDict() {
  return translations[currentLocale] || translations.uk;
}

/* =========================================================
   1. THEME & OPTICAL MODE MANAGEMENT
   ========================================================= */
function applyTheme(theme: 'dark' | 'light') {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_THEME, theme);
  } catch {}

  const themeColor = theme === 'light' ? '#f4f5f8' : '#000000';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
  const telegram = (window as Window & { Telegram?: { WebApp?: {
    isVersionAtLeast?: (version: string) => boolean;
    setBottomBarColor?: (color: string) => void;
  } } }).Telegram?.WebApp;
  if (telegram?.isVersionAtLeast?.('7.10')) {
    telegram.setBottomBarColor?.(themeColor);
  }

  const dict = getDict();
  const headerThemeLabel = document.getElementById('header-theme-label');
  if (headerThemeLabel) {
    headerThemeLabel.textContent = theme === 'light' ? dict['header.themeLight'] : dict['header.themeDark'];
  }

  const lightIcon = document.querySelector('[data-theme-icon="light"]');
  const darkIcon = document.querySelector('[data-theme-icon="dark"]');
  if (lightIcon && darkIcon) {
    lightIcon.classList.toggle('hidden', theme !== 'light');
    darkIcon.classList.toggle('hidden', theme === 'light');
  }

  document.querySelectorAll<HTMLButtonElement>('[data-theme-btn]').forEach((btn) => {
    const isMatch = btn.getAttribute('data-theme-btn') === theme;
    btn.classList.toggle('active', isMatch);
  });
}

function applyPerfMode(enabled: boolean) {
  document.documentElement.classList.toggle('performance-mode', enabled);
  try {
    localStorage.setItem(STORAGE_PERF, enabled ? '1' : '0');
  } catch {}

  const switchBtn = document.getElementById('drawer-perf-switch');
  const switchKnob = document.getElementById('drawer-perf-knob');
  if (switchBtn && switchKnob) {
    switchBtn.setAttribute('aria-checked', String(enabled));
    switchKnob.style.transform = enabled ? 'translateX(20px)' : 'translateX(0)';
  }
}

/* =========================================================
   2. BILINGUAL SYSTEM (UK DEFAULT / EN)
   ========================================================= */
function applyLocale(locale: Locale) {
  currentLocale = locale === 'en' ? 'en' : 'uk';
  document.documentElement.lang = currentLocale;
  try {
    localStorage.setItem(STORAGE_LANG, currentLocale);
  } catch {}

  const dict = getDict();

  // Translate all [data-i18n] nodes
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key && dict[key] !== undefined) {
      el.textContent = dict[key];
    }
  });

  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    const label = dict[el.dataset.i18nAria ?? ''];
    if (label) el.setAttribute('aria-label', label);
  });

  // Translate all [data-i18n-placeholder] inputs
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key && dict[key] !== undefined) {
      el.placeholder = dict[key];
    }
  });

  renderCatalog(currentLocale);

  // Update active state on all language switcher buttons (Header + Settings Drawer)
  document.querySelectorAll<HTMLButtonElement>('[data-lang-btn]').forEach((btn) => {
    const btnLang = btn.getAttribute('data-lang-btn');
    btn.classList.toggle('active', btnLang === currentLocale);
  });

  // Sync active YouTube stage title & badge with current language
  const activeYtItem = document.querySelector<HTMLButtonElement>('.yt-playlist-item.active');
  if (activeYtItem) {
    const titleKey = activeYtItem.getAttribute('data-i18n-title-key');
    const badgeKey = activeYtItem.getAttribute('data-i18n-badge-key');
    const stageTitle = document.getElementById('yt-stage-title');
    const stageBadge = document.getElementById('yt-stage-badge');
    if (stageTitle && titleKey && dict[titleKey]) {
      stageTitle.textContent = dict[titleKey];
    }
    if (stageBadge && badgeKey && dict[badgeKey]) {
      stageBadge.textContent = dict[badgeKey];
    }
  }

  const currentTheme = (document.documentElement.getAttribute('data-theme') as 'dark' | 'light') || 'dark';
  applyTheme(currentTheme);

  updateTuningCountBadge();
  renderUserProfile(currentUserProfile);
}

/* =========================================================
   3. HEADER NAVIGATION, SMOOTH SCROLL & MEGAMENU
   ========================================================= */
function initNavigationAndDrawers() {
  // Smooth scrolling for all section links & deterministic active pill state
  const sectionOrder = ['catalog', 'media', 'promo', 'problems'];
  let manualScrollLockUntil = 0;

  function normalizeSectionId(id: string): string {
    if (id === 'youtube') return 'media';
    if (id === 'support') return 'problems';
    return id;
  }

  function setActiveAnchor(sectionId: string) {
    const normalized = normalizeSectionId(sectionId);
    document.querySelectorAll<HTMLElement>('#header-section-nav [data-anchor-link]').forEach((tab) => {
      const linkTarget = tab.getAttribute('data-anchor-link');
      tab.dataset.active = String(linkTarget === normalized);
      if (linkTarget === normalized) tab.setAttribute('aria-current', 'location');
      else tab.removeAttribute('aria-current');
    });
  }

  function updateActiveSectionOnScroll() {
    if (Date.now() < manualScrollLockUntil) return;

    const triggerLine = Math.max(140, window.innerHeight * 0.35);
    let currentActive = sectionOrder[0];

    for (const id of sectionOrder) {
      const el = document.getElementById(id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top <= triggerLine) {
        currentActive = id;
      }
    }

    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 48) {
      currentActive = sectionOrder[sectionOrder.length - 1];
    }

    setActiveAnchor(currentActive);
  }

  let scrollTicking = false;
  window.addEventListener(
    'scroll',
    () => {
      if (!scrollTicking) {
        window.requestAnimationFrame(() => {
          updateActiveSectionOnScroll();
          scrollTicking = false;
        });
        scrollTicking = true;
      }
    },
    { passive: true }
  );

  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const href = anchor.getAttribute('href');
      if (!href || href === '#') return;
      const rawId = href.slice(1);
      const targetEl = document.getElementById(rawId);
      if (targetEl) {
        e.preventDefault();
        if (rawId === 'top') {
          manualScrollLockUntil = Date.now() + 900;
          setActiveAnchor('catalog');
        } else {
          const normId = normalizeSectionId(rawId);
          manualScrollLockUntil = Date.now() + 950;
          setActiveAnchor(normId);
        }
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  updateActiveSectionOnScroll();

  document.querySelectorAll<HTMLButtonElement>('[data-lang-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lang = btn.getAttribute('data-lang-btn') as Locale | null;
      if (lang) applyLocale(lang);
    });
  });

  document.getElementById('header-theme-toggle')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  const drawer = document.getElementById('settings-drawer');
  const backdrop = document.getElementById('settings-backdrop');

  function openSettings() {
    drawer?.classList.remove('translate-x-full');
    backdrop?.classList.remove('opacity-0', 'pointer-events-none');
    backdrop?.classList.add('opacity-100', 'pointer-events-auto');
  }

  function closeSettings() {
    drawer?.classList.add('translate-x-full');
    backdrop?.classList.add('opacity-0', 'pointer-events-none');
    backdrop?.classList.remove('opacity-100', 'pointer-events-auto');
  }

  document.getElementById('open-settings-btn')?.addEventListener('click', openSettings);
  document.getElementById('close-settings-btn')?.addEventListener('click', closeSettings);
  document.getElementById('done-settings-btn')?.addEventListener('click', closeSettings);
  backdrop?.addEventListener('click', closeSettings);

  document.querySelectorAll<HTMLButtonElement>('[data-theme-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTheme = btn.getAttribute('data-theme-btn') as 'dark' | 'light';
      if (targetTheme) applyTheme(targetTheme);
    });
  });

  document.getElementById('drawer-perf-switch')?.addEventListener('click', () => {
    const isPerf = document.documentElement.classList.contains('performance-mode');
    applyPerfMode(!isPerf);
  });
}

/* =========================================================
   4. PRODUCT CARD GALLERY (FRONT / BACK & COLOR SWITCHER)
   ========================================================= */
function initProductGallery() {
  document.querySelectorAll<HTMLElement>('[data-product-gallery]').forEach((gallery) => {
    const frontImg = gallery.querySelector<HTMLImageElement>('[data-gallery-img="front"]');
    const backImg = gallery.querySelector<HTMLImageElement>('[data-gallery-img="back"]');
    const frontBtn = gallery.querySelector<HTMLButtonElement>('[data-gallery-btn="front"]');
    const backBtn = gallery.querySelector<HTMLButtonElement>('[data-gallery-btn="back"]');

    // 1. Front / Back Switcher (для одягу типу Zip Hoodie)
    if (frontImg && backImg && frontBtn && backBtn) {
      function showView(view: 'front' | 'back') {
        const isBack = view === 'back';
        frontImg!.style.opacity = isBack ? '0' : '1';
        backImg!.style.opacity = isBack ? '1' : '0';

        frontBtn!.classList.toggle('bg-accent', !isBack);
        frontBtn!.classList.toggle('text-white', !isBack);
        frontBtn!.classList.toggle('text-muted', isBack);

        backBtn!.classList.toggle('bg-accent', isBack);
        backBtn!.classList.toggle('text-white', isBack);
        backBtn!.classList.toggle('text-muted', !isBack);
      }

      frontBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showView('front');
      });

      backBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showView('back');
      });

      gallery.addEventListener('click', () => {
        const currentlyBack = backImg.style.opacity === '1';
        showView(currentlyBack ? 'front' : 'back');
      });
    }

    // 2. Color Switcher (Білий / Чорний для Щитка)
    const colorBtns = gallery.querySelectorAll<HTMLButtonElement>('[data-color-btn]');
    if (colorBtns.length && frontImg) {
      colorBtns.forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetSrc = btn.getAttribute('data-img-src');
          const colorId = btn.getAttribute('data-color-btn') || 'white';
          if (targetSrc) {
            frontImg.src = targetSrc;
          }
          colorBtns.forEach((b) => {
            b.classList.remove('bg-white/20', 'text-white', 'shadow-sm', 'ring-1', 'ring-white/30');
            b.classList.add('text-muted');
          });
          btn.classList.add('bg-white/20', 'text-white', 'shadow-sm', 'ring-1', 'ring-white/30');
          btn.classList.remove('text-muted');

          const card = gallery.closest('[data-product-card]');
          if (card) {
            card.setAttribute('data-selected-color', colorId);
          }
        });
      });
    }
  });
}

/* =========================================================
   5. CUSTOM TUNING STUDIO LOGIC & SHTORM GALLERY
   ========================================================= */
function updateTuningCountBadge() {
  const checked = document.querySelectorAll<HTMLInputElement>('#tuning-modules input[type="checkbox"]:checked');
  const badge = document.getElementById('tuning-count-badge');
  const dict = getDict();
  if (badge) {
    badge.textContent = `${checked.length} ${dict['tuning.modulesUnit'] || 'поз.'}`;
  }
}

function initCustomTuning() {
  const vehicleCards = document.querySelectorAll<HTMLButtonElement>('.vehicle-card');
  const previewName = document.getElementById('tuning-preview-name');
  const previewTag = document.getElementById('tuning-preview-tag');
  const previewImg = document.getElementById('tuning-preview-img') as HTMLImageElement | null;
  const photoCaption = document.getElementById('tuning-photo-caption');
  const specPower = document.getElementById('tuning-spec-power');
  const specFocus = document.getElementById('tuning-spec-focus');
  const thumbBtns = document.querySelectorAll<HTMLButtonElement>('.shtorm-thumb-btn');

  thumbBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      thumbBtns.forEach((b) => {
        b.classList.remove('ring-2', 'ring-white', 'opacity-100');
        b.classList.add('opacity-55');
      });
      btn.classList.add('ring-2', 'ring-white', 'opacity-100');
      btn.classList.remove('opacity-55');

      const src = btn.getAttribute('data-photo-src');
      const label = btn.getAttribute('data-photo-label');
      const pos = btn.getAttribute('data-photo-pos') || 'center center';

      if (previewImg && src) {
        previewImg.src = src;
        previewImg.style.objectPosition = pos;
      }
      if (photoCaption && label) {
        photoCaption.textContent = label;
      }
    });
  });

  vehicleCards.forEach((card) => {
    card.addEventListener('click', () => {
      vehicleCards.forEach((c) => {
        c.classList.remove('active');
        const dot = c.querySelector('.vehicle-dot') as HTMLElement | null;
        if (dot) dot.style.background = 'var(--text-tertiary)';
      });

      card.classList.add('active');
      const activeDot = card.querySelector('.vehicle-dot') as HTMLElement | null;
      if (activeDot) activeDot.style.background = 'var(--text-primary)';

      const name = card.getAttribute('data-name') || '';
      const tag = card.getAttribute('data-tag') || '';
      const img = card.getAttribute('data-img') || '';
      const power = card.getAttribute('data-power') || '';
      const focus = card.getAttribute('data-focus') || '';

      if (previewName) previewName.textContent = name;
      if (previewTag) previewTag.textContent = tag;
      if (previewImg && img) {
        previewImg.src = img;
        previewImg.style.objectPosition = 'center 52%';
      }
      if (photoCaption) {
        photoCaption.textContent = name;
      }
      if (specPower) specPower.textContent = power;
      if (specFocus) specFocus.textContent = focus;
    });
  });

  const moduleLabels = document.querySelectorAll<HTMLLabelElement>('#tuning-modules .tuning-chip');
  moduleLabels.forEach((label) => {
    const input = label.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    if (!input) return;

    input.addEventListener('change', () => {
      label.classList.toggle('active', input.checked);
      updateTuningCountBadge();
    });
  });

  const form = document.getElementById('tuning-form') as HTMLFormElement | null;
  form?.addEventListener('submit', (e) => {
    e.preventDefault();

    const activeVehicle = document.querySelector('.vehicle-card.active')?.getAttribute('data-name') || 'Corso Storm XR / Sur-Ron';
    const checkedModules = Array.from(
      document.querySelectorAll<HTMLInputElement>('#tuning-modules input[type="checkbox"]:checked')
    ).map((el) => el.value);

    const clientName = (document.getElementById('tuning-client-name') as HTMLInputElement)?.value.trim() || '';
    const clientContact = (document.getElementById('tuning-client-contact') as HTMLInputElement)?.value.trim() || '';
    const budget = (document.getElementById('tuning-budget') as HTMLSelectElement)?.value || '';
    const notes = (document.getElementById('tuning-notes') as HTMLInputElement)?.value.trim() || '-';

    const message = [
      'ЗАЯВКА В ЛАБОРАТОРІЮ ТЮНІНГУ ALEXOV',
      '----------------------------------',
      `Техніка: ${activeVehicle}`,
      `Обрані роботи: ${checkedModules.length ? checkedModules.join(', ') : 'Індивідуальна консультація'}`,
      `Бюджет: ${budget}`,
      `Клієнт: ${clientName}`,
      `Контакт: ${clientContact}`,
      `Побажання: ${notes}`,
    ].join('\n');

    const tgUrl = `https://t.me/Alexov_Manager?text=${encodeURIComponent(message)}`;
    window.open(tgUrl, '_blank', 'noopener,noreferrer');
  });
}

/* =========================================================
   6. YOUTUBE INTERACTIVE EMBED PLAYER & PLAYLIST SWITCHER
   ========================================================= */
function initYouTubePlaylist() {
  const playerStage = document.getElementById('yt-player-stage');
  const coverLayer = document.getElementById('yt-cover-layer');
  const iframeMount = document.getElementById('yt-iframe-mount');
  const playTrigger = document.getElementById('yt-play-trigger');
  const fullscreenBtn = document.getElementById('yt-fullscreen-btn');
  const items = document.querySelectorAll<HTMLButtonElement>('.yt-playlist-item');
  const stageCta = document.getElementById('yt-stage-cta') as HTMLAnchorElement | null;
  const stageImg = document.getElementById('yt-stage-img') as HTMLImageElement | null;
  const stageTitle = document.getElementById('yt-stage-title');
  const stageBadge = document.getElementById('yt-stage-badge');

  function mountYouTubeIframe(ytId: string) {
    if (!iframeMount || !ytId) return;
    if (coverLayer) {
      coverLayer.classList.add('hidden');
    }
    iframeMount.innerHTML = `<iframe
      src="https://www.youtube.com/embed/${encodeURIComponent(ytId)}?autoplay=1&rel=0&modestbranding=1&playsinline=1"
      title="YouTube video player"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
      class="w-full h-full border-0"
    ></iframe>`;
  }

  coverLayer?.addEventListener('click', () => {
    const activeId = playerStage?.getAttribute('data-active-yt-id') || 'D6lvcRNs1jM';
    mountYouTubeIframe(activeId);
  });

  playTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    const activeId = playerStage?.getAttribute('data-active-yt-id') || 'D6lvcRNs1jM';
    mountYouTubeIframe(activeId);
  });

  fullscreenBtn?.addEventListener('click', () => {
    const activeId = playerStage?.getAttribute('data-active-yt-id') || 'D6lvcRNs1jM';
    if (iframeMount && !iframeMount.querySelector('iframe')) {
      mountYouTubeIframe(activeId);
    }
    const target = (iframeMount?.querySelector('iframe') || playerStage) as any;
    if (target) {
      const reqFs =
        target.requestFullscreen ||
        target.webkitRequestFullscreen ||
        target.mozRequestFullScreen ||
        target.msRequestFullscreen;
      if (reqFs) {
        reqFs.call(target).catch(() => {});
      }
    }
  });

  items.forEach((item) => {
    item.addEventListener('click', () => {
      items.forEach((i) => i.classList.remove('active'));
      item.classList.add('active');

      const ytId = item.getAttribute('data-yt-id') || 'D6lvcRNs1jM';
      const thumb = item.getAttribute('data-yt-thumb') || '';
      const titleKey = item.getAttribute('data-i18n-title-key') || '';
      const badgeKey = item.getAttribute('data-i18n-badge-key') || '';
      const titleEl = item.querySelector('.yt-item-title');
      const badgeEl = item.querySelector('.yt-item-badge');

      playerStage?.setAttribute('data-active-yt-id', ytId);

      const url = `https://youtu.be/${ytId}`;
      if (stageCta) stageCta.href = url;
      if (stageImg && thumb) stageImg.src = thumb;

      if (stageTitle) {
        if (titleKey) stageTitle.setAttribute('data-i18n', titleKey);
        if (titleEl) stageTitle.textContent = titleEl.textContent;
      }
      if (stageBadge) {
        if (badgeKey) stageBadge.setAttribute('data-i18n', badgeKey);
        if (badgeEl) stageBadge.textContent = badgeEl.textContent;
      }

      mountYouTubeIframe(ytId);
    });
  });
}

/* =========================================================
   7. ORDER MODAL FOR CATALOG ITEMS
   ========================================================= */
function initOrderModal() {
  const modal = document.getElementById('order-modal');
  const itemName = document.getElementById('modal-item-name');
  const itemPrice = document.getElementById('modal-item-price');
  const itemVariant = document.getElementById('modal-item-variant');
  const productIdInput = document.getElementById('order-product-id') as HTMLInputElement | null;
  const colorSelector = document.getElementById('modal-color-selector');
  const colorContainer = document.getElementById('modal-color-container');
  const sizeContainer = document.getElementById('modal-size-container');

  // Multi-step elements
  const step1 = document.getElementById('order-step-1');
  const step2 = document.getElementById('order-step-2');
  const stepIndicator1 = document.getElementById('step-indicator-1');
  const stepIndicator2 = document.getElementById('step-indicator-2');
  const nextStepBtn = document.getElementById('order-next-step-btn');
  const prevStepBtn = document.getElementById('order-prev-step-btn');
  const paymentAmountDisplay = document.getElementById('payment-amount-display');

  // Copy card button
  const copyCardBtn = document.getElementById('copy-card-btn');
  const copyCardText = document.getElementById('copy-card-text');

  // Receipt elements
  const receiptInput = document.getElementById('order-receipt-input') as HTMLInputElement | null;
  const receiptDropzone = document.getElementById('receipt-dropzone');
  const receiptEmptyView = document.getElementById('receipt-empty-view');
  const receiptSelectedView = document.getElementById('receipt-selected-view');
  const receiptPreviewImg = document.getElementById('receipt-preview-img') as HTMLImageElement | null;
  const receiptDocIcon = document.getElementById('receipt-doc-icon');
  const receiptFileName = document.getElementById('receipt-file-name');
  const receiptFileSize = document.getElementById('receipt-file-size');
  const receiptChangeBtn = document.getElementById('receipt-change-btn');

  // Form & Submit
  const orderForm = document.getElementById('order-form') as HTMLFormElement | null;
  const submitBtn = document.getElementById('order-submit-btn') as HTMLButtonElement | null;
  const submitText = document.getElementById('order-submit-text');

  let selectedSize = 'L';
  let selectedColor = 'white';
  let selectedColorName = 'Білий';
  let currentProduct: any = null;
  let attachedReceiptFile: File | null = null;

  const telegramInput = document.querySelector<HTMLInputElement>('#order-client-tg');
  let submitting = false;
  const browserKey = orderBrowserKey();
  let submissionKey: string | undefined;

  function syncOrderButtons() {
    const blocked = !attachedReceiptFile || submitting;
    if (submitBtn) {
      submitBtn.disabled = blocked;
      submitBtn.classList.toggle('opacity-50', blocked);
      submitBtn.classList.toggle('cursor-not-allowed', blocked);
    }
  }


  function updateVariantDisplay() {
    if (!itemVariant) return;
    if (currentProduct?.colorVariants && currentProduct.colorVariants.length > 0) {
      itemVariant.textContent = `Колір: ${selectedColorName}`;
      itemVariant.classList.remove('hidden');
    } else if (currentProduct?.id === 'zip-hoodie') {
      itemVariant.textContent = `Розмір: ${selectedSize}`;
      itemVariant.classList.remove('hidden');
    } else {
      itemVariant.classList.add('hidden');
    }
  }

  function setStep(step: 1 | 2) {
    if (step === 1) {
      step1?.classList.remove('hidden');
      step2?.classList.add('hidden');

      if (stepIndicator1) {
        stepIndicator1.className = 'flex-1 flex items-center gap-2 py-1.5 px-2.5 rounded-lg bg-sky-500/15 border border-sky-400/30 text-sky-400 font-mono text-[11px] font-semibold transition-all';
        const num1 = stepIndicator1.querySelector('span:first-child');
        if (num1) num1.className = 'w-4 h-4 rounded-full bg-sky-400 text-black text-[10px] font-black flex items-center justify-center shrink-0';
      }
      if (stepIndicator2) {
        stepIndicator2.className = 'flex-1 flex items-center gap-2 py-1.5 px-2.5 rounded-lg bg-white/5 border border-white/10 text-muted font-mono text-[11px] font-semibold transition-all';
        const num2 = stepIndicator2.querySelector('span:first-child');
        if (num2) num2.className = 'w-4 h-4 rounded-full bg-white/20 text-white text-[10px] font-black flex items-center justify-center shrink-0';
      }
    } else {
      step1?.classList.add('hidden');
      step2?.classList.remove('hidden');

      if (stepIndicator1) {
        stepIndicator1.className = 'flex-1 flex items-center gap-2 py-1.5 px-2.5 rounded-lg bg-emerald-500/15 border border-emerald-400/30 text-emerald-400 font-mono text-[11px] font-semibold transition-all';
        const num1 = stepIndicator1.querySelector('span:first-child');
        if (num1) num1.className = 'w-4 h-4 rounded-full bg-emerald-400 text-black text-[10px] font-black flex items-center justify-center shrink-0';
      }
      if (stepIndicator2) {
        stepIndicator2.className = 'flex-1 flex items-center gap-2 py-1.5 px-2.5 rounded-lg bg-sky-500/15 border border-sky-400/30 text-sky-400 font-mono text-[11px] font-semibold transition-all';
        const num2 = stepIndicator2.querySelector('span:first-child');
        if (num2) num2.className = 'w-4 h-4 rounded-full bg-sky-400 text-black text-[10px] font-black flex items-center justify-center shrink-0';
      }

      // Update payment display
      const currentPrice = itemPrice?.textContent?.trim() || '300 ₴';
      if (paymentAmountDisplay) {
        paymentAmountDisplay.textContent = currentPrice.includes('₴') ? currentPrice.replace('₴', 'грн') : `${currentPrice} грн`;
      }
    }
  }

  function resetReceiptState() {
    attachedReceiptFile = null;
    if (receiptInput) receiptInput.value = '';
    receiptEmptyView?.classList.remove('hidden');
    receiptSelectedView?.classList.add('hidden');
    if (receiptPreviewImg) {
      receiptPreviewImg.src = '';
      receiptPreviewImg.classList.add('hidden');
    }
    receiptDocIcon?.classList.remove('hidden');

    syncOrderButtons();
    if (submitText) {
      submitText.textContent = 'Підтвердити замовлення';
    }
  }

  function handleReceiptFile(file: File) {
    if (!file) return;
    attachedReceiptFile = file;
    submissionKey = undefined;

    if (receiptFileName) receiptFileName.textContent = file.name;
    if (receiptFileSize) receiptFileSize.textContent = `${(file.size / 1024).toFixed(0)} KB • Чек прикріплено ✓`;

    // Preview if image
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (receiptPreviewImg && e.target?.result) {
          receiptPreviewImg.src = String(e.target.result);
          receiptPreviewImg.classList.remove('hidden');
          receiptDocIcon?.classList.add('hidden');
        }
      };
      reader.readAsDataURL(file);
    } else {
      receiptPreviewImg?.classList.add('hidden');
      receiptDocIcon?.classList.remove('hidden');
    }

    receiptEmptyView?.classList.add('hidden');
    receiptSelectedView?.classList.remove('hidden');

    syncOrderButtons();
  }

  function openModal(productId: string, initialColor?: string) {
    if (submitting) return;
    submissionKey = undefined;
    const product = findCatalogProduct(productId);
    if (!product || product.buttonAction === 'disabled') {
      showToastNotification('Замовлення цього товару зараз недоступне!', 'info');
      return;
    }
    currentProduct = product;
    const dict = getDict();

    if (product) {
      if (itemName) itemName.textContent = dict[`product.${product.id}.title`] || product.titleUk;
      if (itemPrice) itemPrice.textContent = `${product.priceUah || '300'} ₴`;
      if (productIdInput) productIdInput.value = product.id;

      // Поле «Ім'я» має бути строго порожнім за замовчуванням (вводиться вручну)
      const nameInput = document.getElementById('order-client-name') as HTMLInputElement | null;
      if (nameInput) {
        nameInput.value = '';
      }

      if (product.colorVariants && product.colorVariants.length > 0) {
        colorContainer?.classList.remove('hidden');
        sizeContainer?.classList.add('hidden');

        const matched = product.colorVariants.find(color => color.id === initialColor) || product.colorVariants[0];
        selectedColor = matched.id;
        selectedColorName = currentLocale === 'en' ? matched.nameEn : matched.nameUk;
        colorSelector?.replaceChildren(...product.colorVariants.map(color => {
          const option = document.createElement('button');
          option.type = 'button';
          option.className = 'color-option-btn glass-sub rounded-xl px-3 py-2 text-sm';
          option.dataset.color = color.id;
          option.dataset.colorName = currentLocale === 'en' ? color.nameEn : color.nameUk;
          option.textContent = option.dataset.colorName;
          option.classList.toggle('active', color.id === matched.id);
          option.setAttribute('aria-pressed', String(color.id === matched.id));
          return option;
        }));
      } else {
        colorContainer?.classList.add('hidden');
        if (product.id === 'zip-hoodie') {
          sizeContainer?.classList.remove('hidden');
        } else {
          sizeContainer?.classList.add('hidden');
        }
      }

      updateVariantDisplay();
    }

    if (telegramInput) telegramInput.value = '';
    // Always start at Step 1 and reset receipt
    setStep(1);
    resetReceiptState();

    modal?.classList.remove('opacity-0', 'pointer-events-none');
    modal?.classList.add('opacity-100', 'pointer-events-auto');
    modal?.setAttribute('aria-hidden', 'false');
    modal?.removeAttribute('inert');
  }

  function closeModal() {
    modal?.classList.add('opacity-0', 'pointer-events-none');
    modal?.classList.remove('opacity-100', 'pointer-events-auto');
    modal?.setAttribute('aria-hidden', 'true');
    modal?.setAttribute('inert', '');
    setStep(1);
    resetReceiptState();
  }

  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const trigger = event.target.closest<HTMLButtonElement>('.open-order-modal-btn, [data-open-order]');
    if (!trigger || trigger.disabled) return;
    const card = trigger.closest<HTMLElement>('[data-product-card]');
    const id = trigger.dataset.productId || card?.dataset.productId;
    if (id) openModal(id, card?.dataset.selectedColor);
  });

  document.getElementById('close-modal-btn')?.addEventListener('click', closeModal);
  document.getElementById('cancel-modal-btn')?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Size selector buttons
  document.querySelectorAll<HTMLButtonElement>('#size-selector .size-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#size-selector .size-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedSize = btn.getAttribute('data-size') || 'L';
      updateVariantDisplay();
    });
  });

  colorSelector?.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const option = event.target.closest<HTMLButtonElement>('button[data-color]');
    if (!option) return;
    colorSelector.querySelectorAll('button').forEach(button => {
      button.classList.toggle('active', button === option);
      button.setAttribute('aria-pressed', String(button === option));
    });
    selectedColor = option.dataset.color ?? '';
    selectedColorName = option.dataset.colorName ?? '';
    updateVariantDisplay();
  });

  // Step navigation
  nextStepBtn?.addEventListener('click', () => {
    const nameInput = document.getElementById('order-client-name') as HTMLInputElement | null;
    const phoneInput = document.getElementById('order-client-phone') as HTMLInputElement | null;
    const cityInput = document.getElementById('order-client-city') as HTMLInputElement | null;

    const name = nameInput?.value.trim() || '';
    const phone = phoneInput?.value.trim() || '';
    const city = cityInput?.value.trim() || '';

    if (!name) {
      showToastNotification('Будь ласка, введіть ваше ім\'я (ПІБ)!', 'error');
      nameInput?.focus();
      return;
    }

    if (!phone) {
      showToastNotification('Будь ласка, введіть номер телефону для доставки!', 'error');
      phoneInput?.focus();
      return;
    }

    if (!city) {
      showToastNotification('Будь ласка, введіть місто та відділення Нової Пошти!', 'error');
      cityInput?.focus();
      return;
    }

    setStep(2);
  });

  prevStepBtn?.addEventListener('click', () => {
    setStep(1);
  });

  // Copy card button
  copyCardBtn?.addEventListener('click', async () => {
    const cardNum = '4874100032959606';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(cardNum);
      } else {
        const ta = document.createElement('textarea');
        ta.value = cardNum;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      if (copyCardText) copyCardText.textContent = 'Скопійовано ✓';
      showToastNotification('Номер карти скопійовано: 4874 1000 3295 9606', 'info');
      setTimeout(() => {
        if (copyCardText) copyCardText.textContent = 'Копіювати';
      }, 2500);
    } catch {
      showToastNotification('4874100032959606', 'info');
    }
  });

  // Receipt Dropzone & File Input
  receiptDropzone?.addEventListener('click', () => {
    receiptInput?.click();
  });

  receiptChangeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    receiptInput?.click();
  });

  receiptInput?.addEventListener('change', () => {
    if (receiptInput.files && receiptInput.files[0]) {
      handleReceiptFile(receiptInput.files[0]);
    } else {
      resetReceiptState();
    }
  });

  // Drag and drop for receipt
  receiptDropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    receiptDropzone.classList.add('border-sky-400');
  });

  receiptDropzone?.addEventListener('dragleave', (e) => {
    e.preventDefault();
    receiptDropzone.classList.remove('border-sky-400');
  });

  receiptDropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    receiptDropzone.classList.remove('border-sky-400');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleReceiptFile(e.dataTransfer.files[0]);
    }
  });

  orderForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (!attachedReceiptFile) {
      showToastNotification('Обов\'язково прикріпіть чек або скріншот оплати перед підтвердженням!', 'error');
      return;
    }

    const prodTitle = itemName?.textContent || 'Щиток на самокат «Vinnytsia Stunt Team»';
    const priceStr = itemPrice?.textContent?.replace(/[^\d]/g, '') || '300';
    const name = (document.getElementById('order-client-name') as HTMLInputElement)?.value.trim() || '';
    const phone = (document.getElementById('order-client-phone') as HTMLInputElement)?.value.trim() || '';
    const city = (document.getElementById('order-client-city') as HTMLInputElement)?.value.trim() || '';
    const tg = telegramInput?.value.trim() || '';
    const isColorItem = Boolean(currentProduct?.colorVariants?.length);

    if (!name || !phone || !city) {
      showToastNotification('Будь ласка, заповніть усі обов\'язкові дані доставки на Кроці 1!', 'error');
      setStep(1);
      return;
    }

    submitting = true;
    syncOrderButtons();
    if (submitText) {
      submitText.textContent = 'Відправка замовлення...';
    }

    try {
      const formData = new FormData();
      formData.append('browserKey', browserKey);
      formData.append('submissionKey', submissionKey ??= newOrderKey());
      formData.append('productTitle', prodTitle);
      if (currentProduct?.id) formData.set('productId', currentProduct.id);
      if (isColorItem) formData.set('colorId', selectedColor);

      formData.append('color', isColorItem ? selectedColorName : '');
      formData.append('size', !isColorItem ? selectedSize : '');
      formData.append('qty', '1');
      formData.append('price', priceStr);
      formData.append('totalAmount', priceStr);
      formData.append('fullName', name);
      formData.append('phone', phone);
      formData.append('npBranch', city);
      if (tg) formData.set('tgUser', tg);
      const initData = extractTelegramWebAppUser()?.initData;
      if (initData) formData.set('initData', initData);
      formData.append('receipt', attachedReceiptFile, attachedReceiptFile.name);

      const res = await fetch('/api/order', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => null);

      if (data?.error === 'order-storage-unavailable' || res.status === 503) {
        showToastNotification(getDict()['order.storageUnavailable'], 'error');
        return;
      }
      if (data?.error === 'catalog-changed') {
        showToastNotification(currentLocale === 'en'
          ? 'The product, price or color changed. Contact support if you already paid.'
          : 'Товар, ціна або колір змінилися. Якщо ви вже оплатили, зверніться до підтримки.', 'error');
        return;
      }
      if (!res.ok || !data?.ok || typeof data.orderNumber !== 'string') throw new Error('Order rejected');
      const orderNumber = data.orderNumber;
      if (currentUserProfile) void refreshCurrentProfile().catch(()=>{});

      if (data.deliveredToTelegram === false) {
        showToastNotification(`Замовлення #${orderNumber} збережено! Менеджер зв'яжеться з вами найближчим часом.`, 'info');
      } else {
        showToastNotification(`Замовлення #${orderNumber} успішно надіслано в групу! Дякуємо!`, 'success');
      }
    } catch {
      showToastNotification(getDict()['order.submitError'], 'error');
      return;
    } finally {
      submitting = false;
      syncOrderButtons();
      if (submitText) submitText.textContent = getDict()['order.confirm'];
    }

    submissionKey = undefined;
    closeModal();
    orderForm.reset();
    resetReceiptState();
  });
}

/* =========================================================
   8. TELEGRAM WEBAPP AUTH, MAINTENANCE GUARD & SERVER D1 PROFILE
   ========================================================= */
function isAdminUser(userOrProfile: { id?: number | string } | null | undefined): boolean {
  if (!userOrProfile) return false;
  return String(userOrProfile.id ?? '').trim() === '5905168657';
}

function evaluateMaintenanceAccess(candidate?: { id?: number | string } | null) {
  const maintenanceScreen = document.getElementById('maintenance-screen');
  const protectedContent = document.getElementById('app-protected-content');
  const maintenanceUserIdEl = document.getElementById('maintenance-user-id');

  const activeCandidate = candidate || currentUserProfile;

  if (maintenanceUserIdEl) {
    const rawId = activeCandidate?.id ? String(activeCandidate.id) : '';
    maintenanceUserIdEl.textContent = rawId ? `ID: ${rawId}` : 'GUEST';
  }

  // Адміністратор з ID 5905168657 ЗАВЖДИ має повний доступ без жодних заглушок.
  // Для всіх інших (telegram_id !== 5905168657) під час техробіт сайт блокується.
  const isAdmin = isAdminUser(activeCandidate);
  const allowed = isAdmin || !serverMaintenanceEnabled;

  if (allowed) {
    maintenanceScreen?.classList.add('hidden');
    maintenanceScreen?.classList.remove('flex');
    protectedContent?.classList.remove('hidden');
    document.body.style.overflow = '';
  } else {
    maintenanceScreen?.classList.remove('hidden');
    maintenanceScreen?.classList.add('flex');
    protectedContent?.classList.add('hidden');
    document.body.style.overflow = 'hidden';
  }
}

async function fetchMaintenanceStatusFromServer() {
  try {
    const res = await fetch('/api/maintenance', { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      if (typeof data?.maintenanceMode === 'boolean') {
        serverMaintenanceEnabled = data.maintenanceMode;
        evaluateMaintenanceAccess(currentUserProfile);
      }
    }
  } catch {}
}

function renderDiscordRolesHtml(rolesOrTags?: string): string {
  const roles = parseTagsList(rolesOrTags);
  return roles
    .map((roleLabel) => {
      const style = resolveDiscordRoleStyle(roleLabel);
      const safeLabel = String(style.label)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<span
        class="discord-role${style.icon ? ' discord-role-prestige' : ''}"
        style="--role-ink: ${style.color}; --role-fill: ${style.bg}; --role-border: ${style.border}; --role-dot: ${style.dotColor}; --role-glow: ${style.glow || 'none'};"
      >
        ${style.icon ? `<span aria-hidden="true">${style.icon}</span>` : '<span class="discord-role-dot" aria-hidden="true"></span>'}
        <span>${safeLabel}</span>
      </span>`;
    })
    .join('');
}

function renderUserAchievementsHtml(rewardIds: string[], progress?: UserProfileRecord): string {
  const activeIds = new Set(rewardIds);
  const english = currentLocale === 'en';
  const elapsedDays = Math.floor(Math.max(0, Date.now() - (Date.parse(progress?.createdAt || '') || Date.now())) / 86_400_000);
  const catalog = ACHIEVEMENTS_CATALOG
    .filter((achievement) => progress || activeIds.has(achievement.id))
    .sort((a, b) => Number(activeIds.has(b.id)) - Number(activeIds.has(a.id)));

  if (!catalog.length) {
    return `<p class="text-sm text-muted">${english ? 'No achievements yet' : 'Досягнень поки немає'}</p>`;
  }

  return catalog.map((achievement: AchievementDef) => {
    const unlocked = activeIds.has(achievement.id);
    const title = english ? achievement.titleEn : achievement.titleUk;
    const description = english ? achievement.descEn : achievement.descUk;
    const target = achievement.days ?? achievement.jet;
    const value = Math.min(target ?? 0, achievement.days ? elapsedDays : (progress?.jetPeak ?? progress?.tokens ?? 0));
    const status = unlocked ? (english ? 'Earned' : 'Отримано') : (english ? 'Locked' : 'Закрито');
    const units = achievement.days ? (english ? 'days' : 'днів') : 'JET';
    return `<div class="achievement-tile liquid-pill" data-earned="${unlocked}">
      <span class="achievement-icon" aria-hidden="true">${achievement.icon}</span>
      <div class="min-w-0">
        <div class="achievement-heading">
          <strong>${title}</strong>
          <span class="achievement-status">${status}</span>
        </div>
        <p class="text-muted">${description}</p>
        ${!unlocked && target ? `<div class="achievement-progress">
          <progress value="${value}" max="${target}" aria-label="${title}"></progress>
          <span>${value} / ${target} ${units}</span>
        </div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function combineRoles(roles?: string, tags?: string): string {
  return [...new Set([roles, tags].filter(Boolean).join(',').split(',').map((role) => role.trim()).filter(Boolean))].join(', ');
}

function computeInitials(firstName?: string, lastName?: string, username?: string): string {
  const first = (firstName || '').trim();
  const last = (lastName || '').trim();
  if (first && last) {
    return `${first[0]}${last[0]}`.toUpperCase();
  }
  if (first.length >= 2) {
    return first.slice(0, 2).toUpperCase();
  }
  if (first.length === 1) {
    return first.toUpperCase();
  }
  if (username) {
    return username.replace(/^@/, '').slice(0, 2).toUpperCase() || 'AX';
  }
  return 'AX';
}

function formatTenureText(createdAtIso?: string): string {
  const dict = getDict();
  const prefix = dict['auth.timeInProjectPrefix'] || (currentLocale === 'en' ? 'In project:' : 'У проєкті:');
  const daysUnit = dict['auth.daysUnit'] || (currentLocale === 'en' ? 'days' : 'днів');
  const hoursUnit = dict['auth.hoursUnit'] || (currentLocale === 'en' ? 'hours' : 'годин');

  const parsedMs = createdAtIso ? Date.parse(createdAtIso) : NaN;
  const startMs = Number.isNaN(parsedMs) ? Date.now() : parsedMs;
  const diffMs = Math.max(0, Date.now() - startMs);

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  return `${prefix} ${days} ${daysUnit}, ${hours} ${hoursUnit}`;
}

function applyAvatarFrame(element: HTMLElement | null, profile: Pick<UserProfileRecord, 'frameId' | 'frameColor'>) {
  if (!element) return;
  if (profile.frameId && /^#[0-9a-f]{6}$/i.test(profile.frameColor || '')) {
    element.dataset.frame = profile.frameId;
    element.style.setProperty('--frame-color', profile.frameColor!);
  } else {
    delete element.dataset.frame;
    element.style.removeProperty('--frame-color');
  }
}

function bindAvatarElement(
  imgEl: HTMLImageElement | null,
  initialsEl: HTMLElement | null,
  photoUrl: string | undefined,
  initials: string
) {
  if (initialsEl) {
    initialsEl.textContent = initials;
  }
  if (!imgEl) return;

  if (photoUrl) {
    imgEl.src = photoUrl;
    imgEl.classList.remove('hidden');
    initialsEl?.classList.add('hidden');
    imgEl.onerror = () => {
      imgEl.classList.add('hidden');
      initialsEl?.classList.remove('hidden');
    };
  } else {
    imgEl.removeAttribute('src');
    imgEl.classList.add('hidden');
    initialsEl?.classList.remove('hidden');
  }
}

function renderUserProfile(profile: UserProfileRecord | null) {
  const dict = getDict();

  const headerLoginBtn = document.getElementById('header-login-btn');
  const headerProfileGroup = document.getElementById('header-profile-group');
  const headerAvatar = document.getElementById('header-user-avatar') as HTMLImageElement | null;
  const headerInitials = document.getElementById('header-user-initials');
  const headerName = document.getElementById('header-user-name');

  const drawerGuest = document.getElementById('drawer-auth-guest');
  const drawerUser = document.getElementById('drawer-auth-user');
  const drawerAvatar = document.getElementById('drawer-user-avatar') as HTMLImageElement | null;
  const drawerInitials = document.getElementById('drawer-user-initials');
  const drawerName = document.getElementById('drawer-user-name');
  const drawerHandle = document.getElementById('drawer-user-handle');

  const modalAuthed = document.getElementById('profile-modal-authed');
  const modalGuest = document.getElementById('profile-modal-guest');
  const modalAvatar = document.getElementById('modal-user-avatar') as HTMLImageElement | null;
  const modalInitials = document.getElementById('modal-user-initials');
  const modalNameStatic = document.getElementById('modal-user-name');
  const modalMarqueeWrap = document.getElementById('modal-name-marquee-wrap');
  const modalNameMarquee1 = document.getElementById('modal-user-name-marquee-1');
  const modalNameMarquee2 = document.getElementById('modal-user-name-marquee-2');
  const modalHandle = document.getElementById('modal-user-handle');
  const modalId = document.getElementById('modal-user-id');
  const modalTenure = document.getElementById('modal-user-tenure');
  const modalBadge = document.getElementById('modal-user-auth-badge');
  const modalTokens = document.getElementById('modal-user-tokens');
  const modalLevel = document.getElementById('modal-user-level');
  const modalRank = document.getElementById('modal-user-rank');

  if (!profile) {
    headerLoginBtn?.classList.remove('hidden');
    headerLoginBtn?.classList.add('flex');
    headerProfileGroup?.classList.add('hidden');
    headerProfileGroup?.classList.remove('flex');

    drawerGuest?.classList.remove('hidden');
    drawerUser?.classList.add('hidden');
    drawerUser?.classList.remove('flex');

    modalAuthed?.classList.add('hidden');
    modalGuest?.classList.remove('hidden');
    return;
  }

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Rider';
  const shortHeaderName = profile.firstName || (profile.username ? `@${profile.username}` : 'Rider');
  const handleText = profile.username
    ? `@${profile.username.replace(/^@/, '')}`
    : dict['auth.noUsername'] || 'Без @username';
  const initials = computeInitials(profile.firstName, profile.lastName, profile.username);
  const tokensCount = Number(profile.tokens ?? 100);

  headerLoginBtn?.classList.add('hidden');
  headerLoginBtn?.classList.remove('flex');
  headerProfileGroup?.classList.remove('hidden');
  headerProfileGroup?.classList.add('flex');

  if (headerName) headerName.textContent = shortHeaderName;
  bindAvatarElement(headerAvatar, headerInitials, profile.photoUrl, initials);

  drawerGuest?.classList.add('hidden');
  drawerUser?.classList.remove('hidden');
  drawerUser?.classList.add('flex');
  if (drawerName) drawerName.textContent = fullName;
  if (drawerHandle) drawerHandle.textContent = handleText;
  bindAvatarElement(drawerAvatar, drawerInitials, profile.photoUrl, initials);

  modalGuest?.classList.add('hidden');
  modalAuthed?.classList.remove('hidden');

  if (modalNameStatic) modalNameStatic.textContent = fullName;
  if (modalNameMarquee1) modalNameMarquee1.textContent = fullName;
  if (modalNameMarquee2) modalNameMarquee2.textContent = fullName;

  const isLongName = fullName.length > 15;
  if (isLongName) {
    modalNameStatic?.classList.add('hidden');
    modalMarqueeWrap?.classList.remove('hidden');
  } else {
    modalNameStatic?.classList.remove('hidden');
    modalMarqueeWrap?.classList.add('hidden');
  }

  if (modalHandle) modalHandle.textContent = handleText;
  if (modalId) modalId.textContent = `ID: ${profile.id}`;
  if (modalTenure) modalTenure.textContent = formatTenureText(profile.createdAt);

  const modalRolesEl = document.getElementById('modal-user-roles');
  const activeRolesStr = combineRoles(profile.roles, profile.tags);
  if (modalRolesEl) {
    modalRolesEl.innerHTML = renderDiscordRolesHtml(activeRolesStr);
  }
  const medal = document.querySelector<HTMLDetailsElement>('#profile-founder-medal');
  if (medal) {
    medal.hidden = !profile.rewards?.includes('founder-50');
    if (medal.hidden) medal.open = false;
  }
  const activeBadge = document.getElementById('modal-active-shop-role');
  activeBadge?.replaceChildren(...(profile.activeRole ? [createRoleBadge(profile.activeRole)] : []));
  const roleSelect = document.querySelector<HTMLSelectElement>('#profile-role-select');
  if (roleSelect) {
    const owned = profile.ownedRoles ?? [];
    roleSelect.hidden = !owned.length;
    roleSelect.replaceChildren(new Option(currentLocale === 'en' ? 'No role' : 'Без ролі', ''),
      ...owned.map(role => new Option(role.name, role.id)));
    roleSelect.value = profile.activeRole?.id ?? '';
    roleSelect.onchange = async () => {
      roleSelect.disabled = true;
      const status = document.getElementById('profile-role-status')!;
      status.textContent = '';
      try {
        const response = await fetch('/api/shop/active-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': extractTelegramWebAppUser()?.initData || '' },
          body: JSON.stringify({ role_id: roleSelect.value || null }),
        });
        const result = await response.json();
        if (!response.ok || !result.profile) throw new Error('role-update-failed');
        currentUserProfile = result.profile;
        renderUserProfile(result.profile);
      } catch {
        roleSelect.value = currentUserProfile?.activeRole?.id ?? '';
        status.textContent = currentLocale === 'en' ? 'Could not update active role.' : 'Не вдалося змінити активну роль.';
      } finally {
        roleSelect.disabled = false;
      }
    };
  }

  if (modalBadge) {
    modalBadge.setAttribute('data-i18n', 'auth.verified');
    modalBadge.textContent = dict['auth.verified'] || 'Telegram Верифіковано';
  }
  if (modalTokens) modalTokens.textContent = String(tokensCount);
  const jetModalBalance = document.getElementById('jet-modal-balance');
  if (jetModalBalance) jetModalBalance.textContent = String(tokensCount);
  if (modalLevel) modalLevel.textContent = `LVL ${profile.level ?? 1} · ${profile.xp ?? 50} XP`;
  if (modalRank) {
    const primaryRole = parseTagsList(activeRolesStr)[0] || 'RIDER';
    modalRank.textContent = primaryRole;
  }

  const modalRewardsContainer = document.getElementById('modal-user-rewards');
  const modalRewardsCount = document.getElementById('modal-rewards-count');
  const userRewardIds = Array.isArray(profile.rewards) ? profile.rewards : [];
  if (modalRewardsContainer) {
    modalRewardsContainer.innerHTML = renderUserAchievementsHtml(userRewardIds, profile);
  }
  if (modalRewardsCount) {
    modalRewardsCount.textContent = `${ACHIEVEMENTS_CATALOG.filter((achievement) => userRewardIds.includes(achievement.id)).length} / ${ACHIEVEMENTS_CATALOG.length}`;
  }

  bindAvatarElement(modalAvatar, modalInitials, profile.photoUrl, initials);
  applyAvatarFrame(document.getElementById('profile-avatar-frame'), profile);


}

async function syncProfileWithBackend(initData = '') {
  try {
    const response = await fetch('/api/profile', initData ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    } : { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    if (typeof data?.maintenanceMode === 'boolean') serverMaintenanceEnabled = data.maintenanceMode;
    return data?.ok && data.profile ? data.profile as UserProfileRecord : null;
  } catch {
    return null;
  }
}

function extractTelegramWebAppUser(): { user: any; initData: string; startParam?: string } | null {
  try {
    const tg = (window as any).Telegram?.WebApp;
    let startParam = '';
    if (tg?.initDataUnsafe?.start_param) {
      startParam = String(tg.initDataUnsafe.start_param).trim();
    }
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const searchParams = new URLSearchParams(window.location.search);
    if (!startParam) {
      startParam =
        searchParams.get('start_param') ||
        searchParams.get('tgWebAppStartParam') ||
        searchParams.get('start') ||
        hashParams.get('tgWebAppStartParam') ||
        hashParams.get('start_param') ||
        '';
    }

    if (tg) {
      try {
        tg.ready?.();
        tg.expand?.();
      } catch {}
      if (tg.initData && tg.initDataUnsafe?.user) {
        return {
          user: tg.initDataUnsafe.user,
          initData: typeof tg.initData === 'string' ? tg.initData : '',
          startParam,
        };
      }
    }

    const rawWebAppData = tg?.initData || hashParams.get('tgWebAppData') || searchParams.get('tgWebAppData');
    if (rawWebAppData) {
      const innerParams = new URLSearchParams(rawWebAppData);
      const userJson = innerParams.get('user');
      if (userJson) {
        if (!startParam && innerParams.get('start_param')) {
          startParam = innerParams.get('start_param') || '';
        }
        return {
          user: JSON.parse(userJson),
          initData: rawWebAppData,
          startParam,
        };
      }
    }
  } catch {}
  return null;
}

/* =========================================================
   TOAST NOTIFICATION HELPER
   ========================================================= */
export function showToastNotification(message: string, type: 'success' | 'info' | 'error' = 'success') {
  let container = document.getElementById('global-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'global-toast-container';
    container.className =
      'site-toast-position fixed left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none px-4 w-full max-w-sm';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  const borderColors: Record<string, string> = {
    success: 'border-emerald-400/40 bg-zinc-950/95 text-emerald-300',
    info: 'border-sky-400/40 bg-zinc-950/95 text-sky-300',
    error: 'border-rose-400/40 bg-zinc-950/95 text-rose-300',
  };
  const iconSvg =
    type === 'success'
      ? `<svg class="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`
      : type === 'info'
      ? `<svg class="w-4 h-4 text-sky-400 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
      : `<svg class="w-4 h-4 text-rose-400 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;

  toast.className = `liquid-pill relative flex items-center gap-2.5 px-4 py-3 rounded-2xl border font-mono text-[12px] font-semibold transition-all duration-300 opacity-0 translate-y-3 ${borderColors[type] || borderColors.success}`;
  toast.innerHTML = `<span class="shrink-0 flex items-center">${iconSvg}</span><span class="flex-1">${message}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('opacity-0', 'translate-y-3');
    toast.classList.add('opacity-100', 'translate-y-0');
  });

  setTimeout(() => {
    toast.classList.remove('opacity-100', 'translate-y-0');
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => {
      toast.remove();
    }, 350);
  }, 3500);
}

/* =========================================================
   PROFILE JET WALLET
   ========================================================= */
function initProfileWallet() {
  const wallet = document.getElementById('profile-jet');
  const toggle = document.getElementById('profile-open-jet-btn');
  const copyRefBtn = document.getElementById('jet-copy-ref-link');
  const refLinkDisplay = document.getElementById('jet-ref-link-display');
  const refLinkText = document.getElementById('jet-ref-link-text');
  const txLoading = document.getElementById('jet-transactions-loading');
  const txList = document.getElementById('jet-transactions-list');

  const overview = document.getElementById('profile-overview');
  const scroll = document.getElementById('profile-modal-scroll');
  const modal = document.getElementById('profile-modal');
  const backButton = document.getElementById('profile-jet-back-btn');
  const profileTitle = document.getElementById('profile-modal-title');
  const profileTag = document.getElementById('profile-modal-tag');
  const walletTitle = document.getElementById('profile-wallet-title');
  let overviewScrollTop = 0;
  let screenAnimation: Animation | undefined;

  function showScreen(showWallet: boolean, animate = true) {
    if (!wallet || !overview || !scroll) return;
    screenAnimation?.cancel();
    overview.classList.toggle('hidden', showWallet);
    wallet.classList.toggle('hidden', !showWallet);
    if (showWallet) document.dispatchEvent(new Event('alexov:wallet-open'));
    backButton?.classList.toggle('hidden', !showWallet);
    profileTitle?.classList.toggle('hidden', showWallet);
    profileTag?.classList.toggle('hidden', showWallet);
    walletTitle?.classList.toggle('hidden', !showWallet);
    toggle?.setAttribute('aria-expanded', String(showWallet));
    modal?.setAttribute('aria-labelledby', showWallet ? 'profile-wallet-title' : 'profile-modal-title');
    scroll.scrollTop = showWallet ? 0 : overviewScrollTop;
    if (!animate) return;

    (showWallet ? backButton : toggle)?.focus({ preventScroll: true });
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      screenAnimation = (showWallet ? wallet : overview).animate?.([
        { opacity: 0, transform: `translateX(${showWallet ? 16 : -16}px)` },
        { opacity: 1, transform: 'translateX(0)' },
      ], { duration: 220, easing: 'cubic-bezier(.2,.75,.3,1)' });
    }
  }

  function back() {
    if (!wallet || wallet.classList.contains('hidden')) return false;
    showScreen(false);
    return true;
  }

  toggle?.addEventListener('click', () => {
    if (!wallet || !currentUserProfile) return;
    overviewScrollTop = scroll?.scrollTop ?? 0;
    showScreen(true);
    if (refLinkText) refLinkText.textContent = `https://t.me/Alexov_Shop_bot?start=ref_${currentUserProfile.id}`;
    refLinkDisplay?.classList.add('hidden');
    void loadJetTransactions(currentUserProfile.id);
  });
  backButton?.addEventListener('click', back);

  async function loadJetTransactions(userId: string | number) {
    if (!txLoading || !txList) return;
    txLoading.classList.remove('hidden');
    txList.classList.add('hidden');
    txList.innerHTML = '';

    try {
      const res = await fetch(`/api/jet/transactions?id=${encodeURIComponent(String(userId))}`, {headers:{'X-Telegram-Init-Data':extractTelegramWebAppUser()?.initData || ''}});
      if (res.ok) {
        const data = await res.json();
        const txs = Array.isArray(data?.transactions) ? data.transactions : [];
        if (txs.length === 0) {
          txList.innerHTML = `<div class="text-center py-6 text-muted font-mono text-[11px]">Транзакцій поки немає</div>`;
        } else {
          txList.innerHTML = txs
            .map((tx: any) => {
              const amt = Number(tx.amount || 0);
              const isPos = amt >= 0;
              const amtFormatted = isPos ? `+${amt}` : `${amt}`;
              const amtColor = isPos ? 'text-emerald-400' : 'text-rose-400';
              const dateStr = tx.created_at
                ? new Date(tx.created_at).toLocaleString('uk-UA', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—';
              const iconSvg = isPos
                ? `<div class="w-7 h-7 rounded-lg bg-emerald-400/15 border border-emerald-400/30 flex items-center justify-center shrink-0 text-emerald-400"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19V5m-7 7l7-7 7 7"/></svg></div>`
                : `<div class="w-7 h-7 rounded-lg bg-rose-400/15 border border-rose-400/30 flex items-center justify-center shrink-0 text-rose-400"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14m7-7l-7 7-7-7"/></svg></div>`;
              return `<div class="liquid-pill rounded-xl p-2.5 flex items-center justify-between gap-3 border border-white/5">
                <div class="flex items-center gap-2.5 min-w-0">
                  ${iconSvg}
                  <div class="min-w-0">
                    <p class="text-[12px] font-semibold text-fg truncate">${tx.reason || 'Нарахування'}</p>
                    <p class="font-mono text-[10px] text-muted">${dateStr}</p>
                  </div>
                </div>
                <div class="text-right shrink-0">
                  <span class="font-mono text-[13px] font-bold ${amtColor}">${amtFormatted} JET</span>
                </div>
              </div>`;
            })
            .join('');
        }
      } else {
        txList.innerHTML = `<div class="text-center py-4 text-muted font-mono text-[11px]">Помилка завантаження історії</div>`;
      }
    } catch {
      txList.innerHTML = `<div class="text-center py-4 text-muted font-mono text-[11px]">Не вдалося завантажити дані</div>`;
    } finally {
      txLoading.classList.add('hidden');
      txList.classList.remove('hidden');
    }
  }

  copyRefBtn?.addEventListener('click', async () => {
    if (!currentUserProfile) return;
    const refLink = `https://t.me/Alexov_Shop_bot?start=ref_${currentUserProfile.id}`;
    try {
      await navigator.clipboard.writeText(refLink);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = refLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    refLinkDisplay?.classList.remove('hidden');
    showToastNotification('Посилання скопійовано! Запроси друга для отримання +100 JET');
  });

  document.addEventListener('alexov:jet-farmed', () => {
    if (currentUserProfile && !wallet?.classList.contains('hidden')) {
      void loadJetTransactions(currentUserProfile.id);
    }
  });

  return {
    back,
    reset() {
      overviewScrollTop = 0;
      showScreen(false, false);
    },
  };
}

type RankedRider = Pick<UserProfileRecord, 'id' | 'firstName' | 'lastName' | 'username' | 'photoUrl' | 'tokens' | 'level' | 'roles' | 'tags' | 'rewards' | 'frameId' | 'frameColor'> & {
  rank: number;
};

function initLeaderboard() {
  const leaderboard = document.querySelector<HTMLDialogElement>('#leaderboard-modal');
  const card = document.querySelector<HTMLDialogElement>('#rider-modal');
  const status = document.getElementById('leaderboard-status');
  const list = document.getElementById('leaderboard-list');
  const avatar = document.querySelector<HTMLImageElement>('#rider-avatar');
  const initials = document.getElementById('rider-initials');
  const name = document.getElementById('rider-name');
  const handle = document.getElementById('rider-handle');
  const rank = document.getElementById('rider-rank');
  const tokens = document.getElementById('rider-tokens');
  const level = document.getElementById('rider-level');
  const roles = document.getElementById('rider-roles');
  const achievements = document.getElementById('rider-achievements');
  if (!leaderboard || !card || !status || !list || !name || !handle || !rank || !tokens || !level || !roles || !achievements) return;

  let pending: AbortController | undefined;
  leaderboard.addEventListener('close', () => pending?.abort());
  for (const dialog of [leaderboard, card]) {
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
  }

  document.getElementById('navigation-leaderboard-btn')?.addEventListener('click', async () => {
    pending?.abort();
    const request = new AbortController();
    pending = request;
    list.replaceChildren();
    status.textContent = getDict()['jet.leaderboardLoading'];
    leaderboard.showModal();
    try {
      const response = await fetch('/api/leaderboard', { signal: request.signal });
      if (!response.ok) throw new Error('Leaderboard request failed');
      const { leaderboard: riders } = await response.json() as { leaderboard: RankedRider[] };
      if (request.signal.aborted) return;
      status.textContent = riders.length ? '' : getDict()['jet.leaderboardEmpty'];
      for (const rider of riders) {
        const fullName = [rider.firstName, rider.lastName].filter(Boolean).join(' ') || 'Rider';
        const username = rider.username ? '@' + rider.username.replace(/^@/, '') : getDict()['auth.noUsername'];
        const riderInitials = computeInitials(rider.firstName, rider.lastName, rider.username);
        const row = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rider-row liquid-pill';
        button.innerHTML = `<span class="rider-row-rank"></span>
          <span class="rider-avatar"><img class="hidden" alt="" loading="lazy"><span></span></span>
          <span class="rider-row-name"><strong></strong><small></small></span>
          <span class="rider-row-tokens"></span>`;
        const rowRank = button.querySelector('.rider-row-rank')!;
        rowRank.textContent = '#' + rider.rank;
        button.dataset.rank = String(rider.rank);
        if (String(rider.id) === String(currentUserProfile?.id)) button.classList.add('rider-row-self');
        button.querySelector('strong')!.textContent = fullName;
        button.querySelector('small')!.textContent = username;
        button.querySelector('.rider-row-tokens')!.textContent = rider.tokens + ' JET';
        bindAvatarElement(button.querySelector('img'), button.querySelector('.rider-avatar span'), rider.photoUrl, riderInitials);
        applyAvatarFrame(button.querySelector('.rider-avatar'), rider);
        button.addEventListener('click', () => {
          bindAvatarElement(avatar, initials, rider.photoUrl, riderInitials);
          applyAvatarFrame(avatar?.closest<HTMLElement>('.rider-avatar') ?? null, rider);
          name.textContent = fullName;
          handle.textContent = username;
          rank.textContent = '#' + rider.rank;
          tokens.textContent = rider.tokens + ' JET';
          level.textContent = 'LVL ' + rider.level;
          roles.innerHTML = renderDiscordRolesHtml(combineRoles(rider.roles, rider.tags));
          achievements.innerHTML = renderUserAchievementsHtml(rider.rewards ?? []);
          card.scrollTop = 0;
          card.showModal();
        });
        row.append(button);
        list.append(row);
      }
    } catch {
      if (!request.signal.aborted) status.textContent = currentLocale === 'en'
        ? 'Could not load the leaderboard.'
        : 'Не вдалося завантажити рейтинг.';
    }
  });
}

function initActivityTimer() {
  const claim = document.querySelector<HTMLButtonElement>('#jet-hourly-claim');
  const tap = document.querySelector<HTMLButtonElement>('#jet-tap');
  const exchange = document.querySelector<HTMLButtonElement>('#jet-tap-exchange');
  const countdown = document.getElementById('jet-farm-countdown');
  const status = document.getElementById('jet-tap-status');
  const units = document.getElementById('jet-tap-units');
  const wallet = document.getElementById('profile-jet');
  const modal = document.getElementById('profile-modal');
  const lifecycle = new AbortController();
  let clock: ReturnType<typeof setInterval> | undefined;
  let pending: AbortController | undefined;
  let state: { tokens: number; jetiki: number; nextRewardIn: number; credited?: number; tapped?: number; exchanged?: number } | undefined;
  let nextCheck = 0;
  let readyAt = 0;
  let queuedTaps = 0;
  let tapCooldownUntil = 0;
  let nextTapTimer: ReturnType<typeof setTimeout> | undefined;
  let stateOwner: string | undefined;

  const visible = () => !document.hidden && currentUserProfile && wallet && !wallet.classList.contains('hidden')
    && modal?.getAttribute('aria-hidden') === 'false';
  const localized = (uk: string, en: string) => currentLocale === 'en' ? en : uk;

  function draw() {
    const remaining = Math.max(0, Math.ceil((readyAt - Date.now()) / 1000));
    if (countdown) {
      countdown.textContent = !state ? '—' : remaining
        ? String(Math.floor(remaining / 60)) + ':' + String(remaining % 60).padStart(2, '0')
        : localized('Нагорода доступна', 'Reward available');
    }
    if (units) units.textContent = String(state?.jetiki ?? '—');
    if (claim) claim.disabled = !state || !!pending || remaining > 0;
    if (tap) tap.disabled = !state || stateOwner !== String(currentUserProfile?.id);
    if (exchange) exchange.disabled = !state || state.jetiki < 100 || !!pending;
  }

  async function request(action: string) {
    const user = currentUserProfile;
    if (!visible() || !user || pending) return;
    const controller = new AbortController();
    pending = controller;
    nextCheck = Date.now() + 10000;
    const timeout = setTimeout(() => controller.abort(), 8000);
    draw();
    try {
      const response = await fetch('/api/jet/' + action, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, initData: extractTelegramWebAppUser()?.initData || '' }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (action === 'tap' && response.status === 429) {
        queuedTaps = 0;
        if (status) status.textContent = localized('Ліміт тапів. Спробуйте пізніше.', 'Tap limit reached. Try again later.');
        return;
      }
      if (!response.ok || !data.ok) throw new Error('JET request failed');
      if (controller.signal.aborted || String(currentUserProfile?.id) !== String(user.id)) return;
      state = data;
      stateOwner = String(user.id);
      readyAt = Date.now() + data.nextRewardIn * 1000;
      if (status) status.textContent = data.exchanged ? localized('Обмін виконано.', 'Exchange complete.')
        : data.credited ? '+50 JET' : '';
      if (currentUserProfile && (data.credited || data.exchanged || currentUserProfile.tokens !== data.tokens)) {
        currentUserProfile.tokens = data.tokens;
        renderUserProfile(currentUserProfile);
        document.dispatchEvent(new Event('alexov:jet-farmed'));
        if (data.credited || data.exchanged) void refreshCurrentProfile().catch(() => {});
      }
    } catch {
      if (status && visible()) status.textContent = localized('Не вдалося оновити баланс.', 'Could not update balance.');
    } finally {
      clearTimeout(timeout);
      if (pending === controller) {
        pending = undefined;
        draw();
        if (action === 'tap') tapCooldownUntil = Date.now() + 250;
        sendNextTap();
      }
    }
  }

  function sendNextTap() {
    if (!visible() || stateOwner !== String(currentUserProfile?.id)) {
      queuedTaps = 0;
      return;
    }
    if (pending || !queuedTaps) return;
    const wait = tapCooldownUntil - Date.now();
    if (wait > 0) {
      if (nextTapTimer === undefined) nextTapTimer = setTimeout(() => {
        nextTapTimer = undefined;
        sendNextTap();
      }, wait);
      return;
    }
    queuedTaps--;
    void request('tap');
  }

  function tick() {
    if (!visible()) return;
    if (stateOwner !== String(currentUserProfile?.id)) {
      if (state) nextCheck = 0;
      state = undefined;
    }
    draw();
    sendNextTap();
    if (Date.now() >= nextCheck) void request('heartbeat');
  }
  function stop() {
    if (clock !== undefined) clearInterval(clock);
    clock = undefined;
    queuedTaps = 0;
    clearTimeout(nextTapTimer);
    nextTapTimer = undefined;
    pending?.abort();
    pending = undefined;
  }
  function resume() {
    stop();
    if (document.hidden) return;
    nextCheck = 0;
    tick();
    clock = setInterval(tick, 1000);
  }

  const options = { signal: lifecycle.signal };
  claim?.addEventListener('click', () => void request('activity-reward'), options);
  exchange?.addEventListener('click', () => void request('exchange'), options);
  tap?.addEventListener('click', () => {
    queuedTaps++;
    sendNextTap();
  }, options);
  document.addEventListener('visibilitychange', resume, options);
  document.addEventListener('alexov:wallet-open', () => { nextCheck = 0; tick(); }, options);
  window.addEventListener('pagehide', stop, options);
  window.addEventListener('pageshow', resume, options);
  document.addEventListener('astro:before-swap', () => { stop(); lifecycle.abort(); }, { once: true });
  resume();
}

function initTelegramAuthAndProfile(navigation: ReturnType<typeof initProfileWallet>) {
  const modal = document.getElementById('profile-modal');
  const settingsDrawer = document.getElementById('settings-drawer');
  const settingsBackdrop = document.getElementById('settings-backdrop');

  let previousFocus: HTMLElement | null = null;

  function openProfileModal() {
    if (modal?.getAttribute('aria-hidden') === 'false') return;
    const opener = document.activeElement;
    previousFocus = opener instanceof HTMLElement ? opener : null;
    if (previousFocus?.closest('#settings-drawer')) {
      previousFocus = document.getElementById('open-settings-btn');
    }
    if (currentUserProfile) {
      renderUserProfile(currentUserProfile);
    }

    settingsDrawer?.classList.add('translate-x-full');
    settingsBackdrop?.classList.add('opacity-0', 'pointer-events-none');
    settingsBackdrop?.classList.remove('opacity-100', 'pointer-events-auto');

    modal?.classList.remove('opacity-0', 'pointer-events-none');
    modal?.classList.add('opacity-100', 'pointer-events-auto');
    modal?.setAttribute('aria-hidden', 'false');
    modal?.removeAttribute('inert');
    document.getElementById('close-profile-modal-btn')?.focus({ preventScroll: true });
  }

  function closeProfileModal() {
    if (modal?.getAttribute('aria-hidden') !== 'false') return;
    modal.setAttribute('inert', '');
    previousFocus?.focus({ preventScroll: true });
    navigation.reset();
    previousFocus = null;
    modal?.classList.add('opacity-0', 'pointer-events-none');
    modal?.classList.remove('opacity-100', 'pointer-events-auto');
    modal?.setAttribute('aria-hidden', 'true');
  }

  let loginRequest: Promise<boolean> | undefined;
  const telegramLaunch = 'https://t.me/Alexov_Shop_bot?startapp';
  const insideTelegram = () => {
    const app = (window as any).Telegram?.WebApp;
    return Boolean(app?.initData || (app?.platform && app.platform !== 'unknown'));
  };

  function authenticateViaTelegramServer() {
    loginRequest ??= (async () => {
      const telegram = extractTelegramWebAppUser();
      const initData = telegram?.initData;
      // Prefer signed launch data so a switched Telegram account replaces the old session.
      let synced = initData ? await syncProfileWithBackend(initData) : null;
      if (!synced) {
        const saved = await syncProfileWithBackend();
        if (!initData || (saved && String(saved.id) === String(telegram?.user?.id))) synced = saved;
      }
      if (!synced) return false;
      currentUserProfile = synced;
      document.dispatchEvent(new Event('alexov:profile-ready'));
      renderUserProfile(synced);
      evaluateMaintenanceAccess(synced);
      return true;
    })().finally(() => { loginRequest = undefined; });
    return loginRequest;
  }

  async function login(openDestination = openProfileModal) {
    if (!insideTelegram() && !currentUserProfile && !loginRequest && !extractTelegramWebAppUser()?.initData) {
      window.location.assign(telegramLaunch);
      return;
    }
    if (await authenticateViaTelegramServer()) {
      openDestination();
      return;
    }
    if (insideTelegram() || extractTelegramWebAppUser()?.initData) {
      const message = currentLocale === 'en'
        ? 'Could not sign in. Try again or reopen Alexov Shop from its Telegram bot.'
        : 'Не вдалося увійти. Спробуйте ще раз або відкрийте Alexov Shop через бота в Telegram.';
      showToastNotification(message, 'error');
    } else {
      window.location.assign(telegramLaunch);
    }
  }

  document.getElementById('header-login-btn')?.addEventListener('click', () => void login());
  document.getElementById('modal-fast-tg-login-btn')?.addEventListener('click', () => void login());

  document.getElementById('header-profile-btn')?.addEventListener('click', openProfileModal);
  for (const [shortcut, destination] of [
    ['navigation-wallet-btn', 'profile-open-jet-btn'],
    ['navigation-role-shop-btn', 'role-shop'],
  ]) {
    document.getElementById(shortcut)?.addEventListener('click', () => {
      const openDestination = () => {
        if (destination === 'role-shop') {
          document.getElementById(destination)?.dispatchEvent(new Event('alexov:open-role-shop'));
          return;
        }
        openProfileModal();
        document.getElementById(destination)?.click();
      };
      if (currentUserProfile) openDestination();
      else void login(openDestination);
    });
  }
  document.getElementById('drawer-auth-btn')?.addEventListener('click', () => void login());
  document.getElementById('close-profile-modal-btn')?.addEventListener('click', closeProfileModal);

  document.getElementById('maintenance-recheck-btn')?.addEventListener('click', () => {
    authenticateViaTelegramServer();
  });

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeProfileModal();
  });
  modal?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!navigation.back()) closeProfileModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = [...modal.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')]
      .filter((control) => control.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });

  void authenticateViaTelegramServer();
  window.addEventListener('online', () => {
    if (!currentUserProfile) void authenticateViaTelegramServer();
  });
}

/* =========================================================
   BOOTSTRAP
   ========================================================= */
async function refreshCurrentProfile() {
 const initData=extractTelegramWebAppUser()?.initData;
 const response=await fetch('/api/profile',{credentials:'same-origin'});
 const data=await response.json();
 const profile=data.ok && data.profile?data.profile:(initData?await syncProfileWithBackend(initData):null);
 if(profile){currentUserProfile=profile;renderUserProfile(profile);}
}

function bootstrapApp() {
  let savedTheme: 'dark' | 'light' = 'dark';
  let savedPerf = true;
  let savedLang: Locale = 'uk';

  try {
    savedTheme = localStorage.getItem(STORAGE_THEME) === 'light' ? 'light' : 'dark';
    const storedPerf = localStorage.getItem(STORAGE_PERF);
    savedPerf = storedPerf !== '0' && storedPerf !== 'false';
    const rawLang = localStorage.getItem(STORAGE_LANG);
    savedLang = rawLang === 'en' ? 'en' : 'uk';
  } catch {}

  applyTheme(savedTheme);
  applyPerfMode(savedPerf);
  applyLocale(savedLang);

  const syncVisibility = () => document.documentElement.classList.toggle('app-backgrounded',document.hidden);
  document.addEventListener('visibilitychange',syncVisibility);
  document.addEventListener('astro:before-swap',()=>document.removeEventListener('visibilitychange',syncVisibility),{once:true});
  syncVisibility();
  initNavigationDrawer();
  initNavigationAndDrawers();
  const profileNavigation = initProfileWallet();
  initTelegramAuthAndProfile(profileNavigation);
  initLeaderboard();
  initGlass();
  initActivityTimer();
  initRoleShop(() => extractTelegramWebAppUser()?.initData || '', () => currentLocale, refreshCurrentProfile);
  fetchMaintenanceStatusFromServer();
  initProductGallery();
  initCustomTuning();
  initYouTubePlaylist();
  initOrderModal();
  const locale = () => currentLocale;
  const reloadCatalog = () => refreshCatalog(locale);
  void reloadCatalog().catch(() => {});
  let subscriberRefreshPending = false;
  const updateSubscribers = async () => {
    if (document.hidden || subscriberRefreshPending) return;
    subscriberRefreshPending = true;
    try {
      await refreshSubscribers(locale);
    } catch {
      // Keep the last displayed count if the connection drops.
    } finally {
      subscriberRefreshPending = false;
    }
  };
  void updateSubscribers();
  const subscriberTimer = window.setInterval(updateSubscribers, 5 * 60_000);
  document.addEventListener('visibilitychange', updateSubscribers);
  document.addEventListener('astro:before-swap', () => {
    window.clearInterval(subscriberTimer);
    document.removeEventListener('visibilitychange', updateSubscribers);
  }, { once: true });
  watchCatalogAdmin(() => extractTelegramWebAppUser()?.initData || '', reloadCatalog);
  initTerms(() => currentLocale, () => extractTelegramWebAppUser()?.initData || '');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}
