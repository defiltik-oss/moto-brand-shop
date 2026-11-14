/// <reference types="vite/client" />
import type { ProductColorOption, ProductItem } from '../data/products';

type AdminProduct = ProductItem & { hidden: boolean };
const uploadTypes = 'image/jpeg,image/png,image/webp';
const adminProductsUrl = '/api/admin/products';
const adminId = '5905168657';

export function watchCatalogAdmin(getInitData: () => string, refresh: () => Promise<void>) {
  const check = () => {
    const telegram = (window as Window & { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id: number } } } } }).Telegram;
    const tgUser = telegram?.WebApp?.initDataUnsafe?.user;
    const currentUserId = tgUser ? String(tgUser.id) : import.meta.env.DEV ? adminId : '';
    if (currentUserId === adminId) initCatalogAdmin(getInitData, refresh);
  };
  document.addEventListener('alexov:profile-ready', check);
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  document.addEventListener('astro:before-swap', () => {
    document.removeEventListener('alexov:profile-ready', check);
    document.removeEventListener('visibilitychange', check);
    window.removeEventListener('focus', check);
  }, { once: true });
  check();
}

function initCatalogAdmin(getInitData: () => string, refresh: () => Promise<void>) {
  const controls = document.getElementById('catalog-admin-controls');
  if (!controls?.hidden) return;
  const headers = () => ({ 'X-Telegram-Init-Data': getInitData() });
  const products: AdminProduct[] = [];

  const open = document.querySelector<HTMLButtonElement>('#catalog-admin-open');
  const dialog = document.querySelector<HTMLDialogElement>('#catalog-admin');
  const form = document.querySelector<HTMLFormElement>('#catalog-admin-form');
  const picker = document.querySelector<HTMLSelectElement>('#catalog-admin-pick');
  const variants = document.getElementById('catalog-admin-variants');
  const gallery = document.getElementById('catalog-admin-gallery');
  const addColor = document.getElementById('catalog-admin-add-color');
  const status = document.getElementById('catalog-admin-status');
  const title = document.getElementById('catalog-admin-title');
  const feedback = document.getElementById('catalog-admin-feedback');
  const grid = document.getElementById('catalog-grid');
  const actions = document.querySelector<HTMLElement>('#product-admin-actions > [data-product-admin]');
  if (!open || !dialog || !form || !picker || !variants || !gallery || !addColor || !status || !title || !feedback || !grid || !actions) return;
  const fields = ['titleUk', 'titleEn', 'categoryUk', 'categoryEn', 'descriptionUk', 'descriptionEn'] as const;
  const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement;

  function photoInputs(parent: HTMLElement, urls: string[]) {
    const saved = document.createElement('div');
    saved.className = 'admin-photo-list';
    saved.dataset.savedPhotos = '';
    urls.filter(Boolean).forEach((url, index) => {
      const item = document.createElement('div');
      item.dataset.savedPhoto = url;
      const preview = document.createElement('img');
      preview.src = url;
      preview.alt = `Фото ${index + 1}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'liquid-pill';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Прибрати фото ${index + 1}`);
      remove.onclick = () => item.remove();
      item.append(preview, remove);
      saved.append(item);
    });
    const files = document.createElement('input');
    files.type = 'file';
    files.accept = uploadTypes;
    files.multiple = true;
    files.dataset.photoFiles = '';
    const upload = document.createElement('label');
    upload.textContent = 'Вибрати зображення · JPG, PNG, WebP до 1,5 МБ';
    upload.append(files);
    parent.append(saved, upload);
  }

  function colorFieldset(color?: ProductColorOption) {
    const group = document.createElement('section');
    group.dataset.variant = '';
    group.className = 'glass-sub grid gap-2 rounded-xl p-3';
    const legend = document.createElement('h3');
    legend.textContent = 'Варіант кольору';
    group.append(legend);
    for (const [key, text, type, value] of [
      ['id', 'ID кольору', 'text', color?.id || ''],
      ['nameUk', 'Назва кольору (UA)', 'text', color?.nameUk || ''],
      ['nameEn', 'Назва кольору (EN)', 'text', color?.nameEn || ''],
      ['colorCode', 'Зразок кольору', 'color', color?.colorCode || '#111111'],
    ]) {
      const label = document.createElement('label');
      label.textContent = text;
      const field = document.createElement('input');
      field.type = type;
      field.value = value;
      field.dataset.colorField = key;
      field.required = key !== 'nameEn';
      field.maxLength = key === 'id' ? 64 : 40;
      label.append(field);
      group.append(label);
    }
    photoInputs(group, color ? color.photos ?? [color.image] : []);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'liquid-pill py-2';
    remove.textContent = 'Видалити цей колір';
    remove.onclick = () => group.remove();
    group.append(remove);
    return group;
  }

  function editProduct() {
    const product = products.find(item => item.id === picker.value);
    title.textContent = product ? 'Редагувати товар' : 'Додати товар';
    form.reset();
    input('id').value = product?.id ?? '';
    input('id').readOnly = Boolean(product);
    for (const field of fields) input(field).value = product?.[field] ?? '';
    input('hidden').checked = product?.hidden ?? false;
    input('statusType').value = product?.statusType ?? 'coming_soon';
    input('price').value = product?.price ? String(product.price) : product?.priceUah?.replace(/\s/g, '') ?? '';
    gallery.querySelectorAll('label, [data-saved-photos]').forEach(element => element.remove());
    photoInputs(gallery, product?.gallery ?? (product && !product.colorVariants?.length
      ? [product.image, product.secondaryImage].filter((url): url is string => Boolean(url)) : []));
    variants.replaceChildren(...(product?.colorVariants ?? []).map(colorFieldset));
    status.textContent = '';
  }

  function populate(selected = '') {
    picker.replaceChildren(new Option('Новий товар', ''));
    for (const item of products) picker.add(new Option(item.titleUk + (item.hidden ? ' (приховано)' : ''), item.id));
    picker.value = selected;
    editProduct();
  }

  function remember(product: AdminProduct) {
    const index = products.findIndex(item => item.id === product.id);
    if (index === -1) products.push(product);
    else products[index] = product;
  }

  async function showEditor(id = '') {
    if (dialog.open || open.disabled) return;
    if (!id) {
      populate();
      picker.disabled = false;
      form.hidden = false;
      dialog.showModal();
      return;
    }
    dialog.showModal();
    const submit = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
    form.hidden = true;
    picker.disabled = true;
    const notice = document.createElement('p');
    notice.setAttribute('role', 'status');
    notice.textContent = 'Завантаження товарів…';
    form.before(notice);
    open.disabled = true;
    try {
      const response = await fetch(adminProductsUrl, { headers: headers(), cache: 'no-store' });
      if (response.status === 403) throw new Error('Сервер не підтвердив права на редагування. Перезапустіть Mini App у Telegram.');
      if (!response.ok) throw new Error('Не вдалося завантажити каталог.');
      const data = await response.json();
      if (!Array.isArray(data.products)) throw new Error('Не вдалося завантажити каталог.');
      if (id && !data.products.some((product: AdminProduct) => product.id === id)) throw new Error('Товар більше не доступний.');
      products.splice(0, products.length, ...data.products);
      populate(id);
      picker.disabled = false;
      submit.disabled = false;
      form.hidden = false;
      notice.remove();
    } catch (error) {
      notice.textContent = error instanceof Error ? error.message : 'Не вдалося завантажити каталог.';
    } finally {
      open.disabled = false;
      if (dialog.open) dialog.addEventListener('close', () => notice.remove(), { once: true });
      else notice.remove();
    }
  }

  function mountCardActions() {
    grid.querySelectorAll<HTMLElement>('[data-product-admin-host]:not([hidden])').forEach(card => {
      const id = card.dataset.productId;
      const product = products.find(item => item.id === id);
      if (!id || product?.hidden || card.querySelector('[data-product-admin]')) return;
      const controls = actions.cloneNode(true) as HTMLElement;
      const edit = controls.querySelector<HTMLButtonElement>('[data-edit-product]')!;
      const select = controls.querySelector<HTMLSelectElement>('[data-product-status]')!;
      edit.onclick = () => { void showEditor(id); };
      select.value = product?.statusType ?? card.dataset.catalogStatus ?? 'coming_soon';
      let savedStatus = select.value;
      select.onchange = async () => {
        select.disabled = true;
        edit.disabled = true;
        feedback.hidden = false;
        feedback.textContent = 'Оновлюю статус…';
        try {
          const response = await fetch(adminProductsUrl, {
            method: 'PATCH',
            headers: { ...headers(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, statusType: select.value }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error === 'price-required'
            ? 'Спочатку вкажіть ціну товару.'
            : response.status === 403 ? 'Знову відкрийте магазин у Telegram.' : 'Не вдалося змінити статус.');
          remember(data.product);
          select.value = data.product.statusType;
          savedStatus = select.value;
          card.dataset.catalogStatus = savedStatus;
          feedback.textContent = 'Статус оновлено.';
          await refresh().catch(() => { feedback.textContent = 'Статус збережено. Оновіть сторінку.'; });
        } catch (error) {
          select.value = savedStatus;
          feedback.textContent = error instanceof Error ? error.message : 'Не вдалося змінити статус.';
        } finally {
          select.disabled = false;
          edit.disabled = false;
        }
      };
      (card.querySelector('.product-card-bottom') ?? card).append(controls);
    });
  }

  const observer = new MutationObserver(mountCardActions);
  observer.observe(grid, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('astro:before-swap', () => observer.disconnect(), { once: true });
  mountCardActions();

  picker.onchange = editProduct;
  addColor.onclick = () => {
    if (variants.children.length < 8) variants.append(colorFieldset());
    else status.textContent = 'Максимум 8 кольорів на товар.';
  };
  open.onclick = () => { void showEditor(); };
  form.onsubmit = async event => {
    event.preventDefault();
    const submit = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
    if (submit.disabled) return;
    submit.disabled = true;
    picker.disabled = true;
    status.textContent = 'Зберігаю…';
    try {
      const body = new FormData();
      let upload = 0;
      const photos = (group: HTMLElement) => {
        const paths = Array.from(group.querySelectorAll<HTMLElement>('[data-saved-photo]'), photo => photo.dataset.savedPhoto!);
        for (const file of group.querySelector<HTMLInputElement>('[data-photo-files]')!.files ?? []) {
          if (file.size > 1_500_000 || upload >= 12) throw new Error('Максимум 12 нових фото за раз, до 1,5 МБ кожне.');
          const key = 'upload:' + upload++;
          body.append(key, file);
          paths.push(key);
        }
        if (paths.length > 6) throw new Error('Максимум 6 фото в одній галереї.');
        return paths;
      };
      const id = input('id').value.trim();
      if (!picker.value && products.some(product => product.id === id)) throw new Error('Товар із таким ID вже існує.');
      const colorVariants = Array.from(variants.querySelectorAll<HTMLElement>('[data-variant]'), group => ({
        ...Object.fromEntries(Array.from(group.querySelectorAll<HTMLInputElement>('[data-color-field]'), el => [el.dataset.colorField, el.value.trim()])),
        photos: photos(group),
      }));
      body.set('product', JSON.stringify({
        ...Object.fromEntries(fields.map(name => [name, input(name).value.trim()])),
        id, create: !picker.value, hidden: input('hidden').checked, statusType: input('statusType').value,
        price: input('price').value ? Number(input('price').value) : null,
        gallery: photos(gallery), colorVariants,
      }));
      const result = await fetch(adminProductsUrl, { method: 'PUT', headers: headers(), body });
      const data = await result.json();
      if (!result.ok) throw new Error(result.status === 403 ? 'Сервер не підтвердив права на збереження. Перезапустіть Mini App у Telegram.' : 'Помилка збереження: ' + data.error);
      remember(data.product);
      populate(id);
      status.textContent = 'Збережено.';
      await refresh().catch(() => { status.textContent = 'Збережено. Оновіть сторінку, щоб побачити зміни.'; });
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Не вдалося зберегти товар.';
    } finally {
      submit.disabled = false;
      picker.disabled = false;
    }
  };
  controls.hidden = false;
}
