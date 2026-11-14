import { PRODUCTS, type ProductItem } from '../data/products';
import type { Locale } from '../data/i18n';

let products = PRODUCTS;
let subscribers: number | null = null;

export const findCatalogProduct = (id: string) => products.find(product => product.id === id);

function button(label: string) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'liquid-pill px-3 py-2 text-sm';
  element.textContent = label;
  return element;
}

function renderProduct(product: ProductItem, locale: Locale) {
  const english = locale === 'en';
  const title = english ? product.titleEn : product.titleUk;
  const card = document.createElement('article');
  card.dataset.managedProduct = '';
  card.dataset.productCard = '';
  card.dataset.productAdminHost = '';
  card.dataset.catalogStatus = product.statusType;
  card.dataset.productId = product.id;
  card.className = 'glass catalog-product flex flex-col rounded-2xl p-5 sm:p-7';
  const header = document.createElement('div');
  header.className = 'product-card-header flex items-center justify-between gap-2 pb-4';
  const category = document.createElement('p');
  category.className = 'tech-badge min-w-0 truncate';
  category.textContent = english ? product.categoryEn : product.categoryUk;

  const image = document.createElement('img');
  image.className = 'h-full w-full object-contain';
  const media = document.createElement('div');
  media.className = 'product-card-media glass-sub relative my-5 aspect-[4/3] w-full overflow-hidden rounded-xl p-4';
  const switches = document.createElement('div');
  switches.className = 'product-card-switches';
  image.loading = product.id === 'scooter-shield-vst' ? 'eager' : 'lazy';
  if (product.id === 'scooter-shield-vst') image.fetchPriority = 'high';
  image.alt = title;
  const colors = document.createElement('div');
  colors.className = 'product-color-switch liquid-pill';
  const gallery = document.createElement('div');
  gallery.className = 'product-photo-switch liquid-pill';
  switches.append(colors, gallery);
  media.append(image, switches);
  const renderGallery = (urls: string[]) => {
    image.src = urls[0];
    gallery.replaceChildren();
    gallery.hidden = urls.length <= 1;
    if (urls.length <= 1) return;
    for (const [index, url] of urls.entries()) {
      const photo = button(String(index + 1));
      photo.setAttribute('aria-label', (english ? 'Photo ' : 'Фото ') + (index + 1));
      photo.setAttribute('aria-pressed', String(index === 0));
      photo.onclick = () => {
        image.src = url;
        gallery.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === photo)));
      };
      gallery.append(photo);
    }
  };
  for (const variant of product.colorVariants ?? []) {
    const option = button(english ? variant.nameEn : variant.nameUk);
    const dot = document.createElement('span');
    dot.className = 'product-color-dot';
    dot.style.backgroundColor = variant.colorCode || '#fff';
    option.prepend(dot);
    option.onclick = () => {
      card.dataset.selectedColor = variant.id;
      colors.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === option)));
      renderGallery(variant.photos ?? [variant.image]);
    };
    colors.append(option);
  }
  colors.hidden = !colors.children.length;
  if (colors.firstElementChild instanceof HTMLButtonElement) colors.firstElementChild.click();
  else renderGallery(product.gallery?.length ? product.gallery : [product.image, ...(product.secondaryImage ? [product.secondaryImage] : [])]);

  const heading = document.createElement('h3');
  heading.className = 'text-xl font-semibold tracking-tight text-fg sm:text-2xl';
  heading.textContent = title;
  const description = document.createElement('p');
  description.className = 'mt-2 text-xs leading-relaxed text-muted sm:text-sm';
  description.textContent = (english ? product.descriptionEn : product.descriptionUk) || product.descriptionUk;
  const status = document.createElement('p');
  status.className = 'product-stock-badge glass-sub';
  status.textContent = english ? product.statusBadgeEn : product.statusBadgeUk;
  const price = document.createElement('strong');
  price.textContent = product.price ? new Intl.NumberFormat(english ? 'en' : 'uk').format(product.price) + ' ₴' : product.priceUah ? product.priceUah + ' ₴' : '';
  const order = button(english ? product.buttonTextEn : product.buttonTextUk);
  order.dataset.openOrder = '';
  order.disabled = product.buttonAction !== 'order';
  order.className = (order.disabled ? 'glass-sub' : 'btn-primary') + ' rounded-xl px-4 py-2 text-xs font-semibold';
  header.append(category, status);
  const footer = document.createElement('div');
  footer.className = 'product-card-footer flex items-center justify-between gap-3 pt-4';
  footer.append(price, order);
  const bottom = document.createElement('div');
  bottom.className = 'product-card-bottom flex flex-col pt-6';
  bottom.append(footer);
  card.append(header, media);
  card.append(heading, description, bottom);
  return card;
}

export function renderCatalog(locale: Locale) {
  const grid = document.getElementById('catalog-grid');
  if (!grid) return;
  grid.querySelectorAll('[data-managed-product]').forEach(card => card.remove());
  for (const child of grid.querySelectorAll<HTMLElement>('[data-product-card]')) {
    child.hidden = !products.some(product => product.id === child.dataset.productId && !product.managed);
    child.classList.toggle('hidden', child.hidden);
  }
  for (const product of products) {
    const existing = Array.from(grid.querySelectorAll<HTMLElement>('[data-product-card]'))
      .find(card => card.dataset.productId === product.id && !card.hasAttribute('data-managed-product'));
    const card = product.managed ? renderProduct(product, locale) : existing;
    if (card) grid.append(card);
  }
  renderSubscribers(locale);
}

function renderSubscribers(locale: Locale) {
  if (subscribers !== null) {
    const formatted = subscribers >= 1000 ? (subscribers / 1000).toFixed(2).replace(/\.?0+$/, '') + 'K' : String(subscribers);
    document.querySelectorAll('[data-i18n="hero.stat1Value"]').forEach(el => { el.textContent = formatted; });
    document.querySelectorAll('[data-i18n="social.youtube.sub"]').forEach(el => {
      el.textContent = formatted + (locale === 'en' ? ' subscribers' : ' підписників');
    });
  }
}

export async function refreshCatalog(locale: () => Locale) {
  const response = await fetch('/api/catalog');
  if (!response.ok) throw new Error('catalog-unavailable');
  const data = await response.json();
  if (!Array.isArray(data.products)) throw new Error('catalog-unavailable');
  products = data.products;
  renderCatalog(locale());
}

export async function refreshSubscribers(locale: () => Locale) {
  const response = await fetch('/api/catalog/subscribers');
  if (!response.ok) return;
  const { count } = await response.json();
  if (!Number.isSafeInteger(count) || count < 0) return;
  subscribers = count;
  renderSubscribers(locale());
}
