/**
 * Scroll reveals driven by ScrollTrigger + IntersectionObserver.
 *  - [data-reveal-group]  : catalog cards smoothly reveal on scroll into view and pause
 *                           animations when scrolled out of the active viewport.
 *  - [data-reveal]        : standalone elements fade in from bottom.
 *  - [data-words]         : text revealed word by word (About section).
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function initReveals(): void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  // Catalog cards & grouped items: smoothly reveal on scroll into view and pause animations when scrolled out
  document.querySelectorAll<HTMLElement>('[data-reveal-group]').forEach((group) => {
    const items = Array.from(group.querySelectorAll<HTMLElement>('[data-reveal]'));
    const tweens = new Map<HTMLElement, gsap.core.Tween>();

    items.forEach((item, index) => {
      const tween = gsap.fromTo(
        item,
        { opacity: 0, y: 40, scale: 0.97 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 1.05,
          delay: (index % 3) * 0.1,
          ease: 'expo.out',
          paused: true,
        },
      );
      tweens.set(item, tween);
    });

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const t = tweens.get(el);
          if (entry.isIntersecting) {
            el.classList.remove('is-offscreen');
            t?.play();
          } else {
            // Pause any active GSAP tween or CSS animation when scrolled out of view
            if (t && t.isActive()) t.pause();
            el.classList.add('is-offscreen');
          }
        }
      },
      { threshold: 0.08, rootMargin: '40px 0px' },
    );

    items.forEach((item) => io.observe(item));
  });

  // Standalone reveals (elements not inside a group) – one by one as scrolled
  document.querySelectorAll<HTMLElement>('[data-reveal]:not([data-reveal-group] [data-reveal])').forEach((el) => {
    gsap.to(el, {
      opacity: 1,
      y: 0,
      duration: 1.15,
      ease: 'expo.out',
      scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none pause' },
    });
  });

  // Word-by-word scrubbed reveal: words light up as the user scrolls
  document.querySelectorAll<HTMLElement>('[data-words]').forEach((el) => {
    gsap.fromTo(
      el.querySelectorAll('.word'),
      { opacity: 0.14 },
      {
        opacity: 1,
        ease: 'none',
        stagger: 0.1,
        scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom 45%', scrub: true },
      },
    );
  });
}
