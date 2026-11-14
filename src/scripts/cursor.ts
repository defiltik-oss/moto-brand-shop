/**
 * Custom cursor – a precise liquid dot plus a halo.
 *  - Default: a small, lagging glass halo ring follows the pointer.
 *  - Over small interactive elements (buttons, links, pills): the halo is magnetically pulled
 *    toward the element and morphs into a glass lens that hugs its shape.
 *  - Over big targets (product cards, [data-cursor="view"]): a 104px glass lens follows the pointer.
 * Disabled on touch devices.
 */
import gsap from 'gsap';

const SEL = '[data-cursor], a, button';
const BASE = 34;

export function initCursor(): void {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const dot = document.querySelector<HTMLElement>('[data-cursor-dot]');
  const halo = document.querySelector<HTMLElement>('[data-cursor-halo]');
  if (!fine || !dot || !halo) return;

  document.documentElement.classList.add('has-cursor');
  gsap.set([dot, halo], { xPercent: -50, yPercent: -50, opacity: 0 });
  gsap.set(halo, { width: BASE, height: BASE, borderRadius: BASE / 2 });

  const dotX = gsap.quickTo(dot, 'x', { duration: 0.06, ease: 'power3' });
  const dotY = gsap.quickTo(dot, 'y', { duration: 0.06, ease: 'power3' });
  const haloX = gsap.quickTo(halo, 'x', { duration: 0.5, ease: 'expo.out' });
  const haloY = gsap.quickTo(halo, 'y', { duration: 0.5, ease: 'expo.out' });

  let mode: 'idle' | 'fit' | 'lens' = 'idle';
  let target: HTMLElement | null = null;
  const pos = { x: -100, y: -100 };

  const follow = () => {
    if (mode === 'fit' && target) {
      // Magnetic pull: halo sits mostly on the element, nudged toward the pointer
      const r = target.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      haloX(cx + (pos.x - cx) * 0.18);
      haloY(cy + (pos.y - cy) * 0.18);
    } else {
      haloX(pos.x);
      haloY(pos.y);
    }
  };

  window.addEventListener(
    'mousemove',
    (e) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
      gsap.to([dot, halo], { opacity: 1, duration: 0.3, overwrite: 'auto' });
      dotX(pos.x);
      dotY(pos.y);
      follow();
    },
    { passive: true },
  );
  document.addEventListener('mouseleave', () => gsap.to([dot, halo], { opacity: 0, duration: 0.3 }));

  const enter = (el: HTMLElement) => {
    target = el;
    const r = el.getBoundingClientRect();
    const big = el.dataset.cursor === 'view' || r.width > 300 || r.height > 110;
    mode = big ? 'lens' : 'fit';
    halo.classList.add('is-lens');

    if (big) {
      gsap.to(halo, { width: 104, height: 104, borderRadius: 52, duration: 0.6, ease: 'expo.out' });
    } else {
      // Hug the element's own corner radius
      const br = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 12;
      const h = r.height + 12;
      gsap.to(halo, {
        width: r.width + 16,
        height: h,
        borderRadius: Math.min(br + 6, h / 2),
        duration: 0.55,
        ease: 'expo.out',
      });
    }
    gsap.to(dot, { scale: big ? 0.6 : 0, duration: 0.3 });
    follow();
  };

  const leave = () => {
    mode = 'idle';
    target = null;
    halo.classList.remove('is-lens');
    gsap.to(halo, { width: BASE, height: BASE, borderRadius: BASE / 2, duration: 0.6, ease: 'expo.out' });
    gsap.to(dot, { scale: 1, duration: 0.3 });
    follow();
  };

  document.addEventListener('mouseover', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(SEL);
    if (el && el !== target) enter(el);
  });
  document.addEventListener('mouseout', (e) => {
    const from = (e.target as HTMLElement).closest(SEL);
    const to = (e.relatedTarget as HTMLElement | null)?.closest?.(SEL);
    if (from && !to) leave();
    else if (from && to && from !== to) enter(to as HTMLElement);
  });
}
