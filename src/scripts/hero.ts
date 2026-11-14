/**
 * Hero: smooth bottom-to-top entrance synchronized with preloader exit,
 * 3D tilt of the mascot on mouse hover, and soft scroll parallax.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/** Pre-set initial hidden state before preloader fades so there is never a visual jump. */
export function prepareHeroIntro(): void {
  const hero = document.querySelector('[data-hero]');
  if (!hero) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const sub = hero.querySelector('[data-hero-sub]');
  const lines = hero.querySelectorAll('[data-hero-line]');
  const kicker = hero.querySelector('[data-hero-kicker]');
  const cta = hero.querySelector('[data-hero-cta]');
  const character = hero.querySelector('[data-hero-character]');

  gsap.set([sub, kicker, cta].filter(Boolean), { opacity: 0, y: 24 });
  gsap.set(lines, { opacity: 0, y: 42 });
  if (character) gsap.set(character, { opacity: 0, y: 32, scale: 0.98 });
}

/** Graceful bottom-to-top reveal – triggered as the logo glides into the header. */
export function playHeroIntro(): void {
  const hero = document.querySelector('[data-hero]');
  if (!hero) return;

  const sub = hero.querySelector<HTMLElement>('[data-hero-sub]');
  const lines = hero.querySelectorAll<HTMLElement>('[data-hero-line]');
  const kicker = hero.querySelector<HTMLElement>('[data-hero-kicker]');
  const cta = hero.querySelector<HTMLElement>('[data-hero-cta]');
  const character = hero.querySelector<HTMLElement>('[data-hero-character]');

  const removeInitAttr = (el: Element | null) => el?.removeAttribute('data-hero-init');

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    hero.querySelectorAll('[data-hero-init]').forEach((el) => el.removeAttribute('data-hero-init'));
    gsap.set([sub, lines, kicker, cta, character].filter(Boolean), { clearProps: 'all' });
    return;
  }

  gsap
    .timeline({ defaults: { ease: 'power3.out' } })
    .to(
      sub,
      {
        y: 0,
        opacity: 1,
        duration: 0.95,
        onComplete: () => removeInitAttr(sub),
      },
      0.1,
    )
    .to(
      lines,
      {
        y: 0,
        opacity: 1,
        duration: 1.05,
        stagger: 0.12,
        onComplete: () => lines.forEach((l) => removeInitAttr(l)),
      },
      0.18,
    )
    .to(
      kicker,
      {
        y: 0,
        opacity: 1,
        duration: 0.95,
        onComplete: () => removeInitAttr(kicker),
      },
      0.36,
    )
    .to(
      cta,
      {
        y: 0,
        opacity: 1,
        duration: 0.95,
        onComplete: () => {
          // Remove [data-hero-init] BEFORE clearing transform so CSS never resets opacity to 0
          removeInitAttr(cta);
          if (cta) gsap.set(cta, { clearProps: 'transform' });
        },
      },
      0.46,
    )
    .to(
      character,
      {
        y: 0,
        opacity: 1,
        scale: 1,
        duration: 1.2,
        ease: 'expo.out',
        onComplete: () => removeInitAttr(character),
      },
      0.22,
    );
}

export function initHeroParallax(): void {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  const tilt = hero?.querySelector<HTMLElement>('[data-tilt]');
  if (!hero) return;

  // Subtle 3D tilt (max ±8°) for mascot on fine pointers
  if (tilt && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const rx = gsap.quickTo(tilt, 'rotationX', { duration: 0.9, ease: 'power3' });
    const ry = gsap.quickTo(tilt, 'rotationY', { duration: 0.9, ease: 'power3' });
    const MAX = 8;

    hero.addEventListener('mousemove', (e) => {
      const r = tilt.getBoundingClientRect();
      const nx = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
      const ny = (e.clientY - (r.top + r.height / 2)) / window.innerHeight;
      ry(gsap.utils.clamp(-MAX, MAX, nx * MAX * 2.5));
      rx(gsap.utils.clamp(-MAX, MAX, -ny * MAX * 2.5));
    });

    hero.addEventListener('mouseleave', () => {
      rx(0);
      ry(0);
    });
  }

  gsap.to('[data-hero-content]', {
    yPercent: 8,
    opacity: 0.3,
    ease: 'none',
    scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
  });
  ScrollTrigger.refresh();
}
