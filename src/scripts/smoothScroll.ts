/**
 * Lenis smooth scrolling, wired into GSAP's ticker so ScrollTrigger
 * and Lenis always share the same animation frame.
 * Also controls the floating Liquid Glass up/down scroll helper button.
 */
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const easeOutExpo = (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t));

export function initSmoothScroll(): Lenis {
  const events = new AbortController();
  gsap.registerPlugin(ScrollTrigger);

  const lenis = new Lenis({
    duration: 1.2,
    easing: easeOutExpo,
    smoothWheel: true,
  });

  // Keep ScrollTrigger in sync with Lenis' virtual scroll position
  lenis.on('scroll', ScrollTrigger.update);
  const tick = (time:number) => lenis.raf(time * 1000);
  const pause = () => {gsap.ticker.remove(tick);lenis.stop();};
  const resume = () => {pause();if(!document.hidden){lenis.start();gsap.ticker.add(tick);}};
  document.addEventListener('visibilitychange',resume,{signal:events.signal});
  window.addEventListener('pagehide',pause,{signal:events.signal});
  window.addEventListener('pageshow',resume,{signal:events.signal});
  document.addEventListener('astro:before-swap',()=>{pause();events.abort();lenis.destroy();},{once:true});
  resume();
  gsap.ticker.lagSmoothing(0);

  // Anchor links scroll smoothly through Lenis
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector<HTMLElement>(id);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -40, duration: 1.35, easing: easeOutExpo });
    }, {signal:events.signal});
  });

  // Floating Liquid Glass Up/Down Scroll Helper Button
  const helperBtn = document.querySelector<HTMLButtonElement>('[data-scroll-helper]');
  if (helperBtn) {
    const updateHelperState = () => {
      const scrolledDown = window.scrollY > window.innerHeight * 0.45;
      const nextDir = scrolledDown ? 'up' : 'down';
      if (helperBtn.dataset.dir !== nextDir) {
        helperBtn.dataset.dir = nextDir;
        helperBtn.setAttribute(
          'aria-label',
          scrolledDown ? 'Повернутися нагору' : 'Перейти до каталогу',
        );
      }
    };

    lenis.on('scroll', updateHelperState);
    window.addEventListener('resize', updateHelperState, { passive: true, signal:events.signal });
    updateHelperState();

    helperBtn.addEventListener('click', () => {
      const isUp = helperBtn.dataset.dir === 'up';
      if (isUp) {
        lenis.scrollTo(0, { duration: 1.4, easing: easeOutExpo });
      } else {
        const catalog = document.querySelector<HTMLElement>('#catalog');
        if (catalog) {
          lenis.scrollTo(catalog, { offset: -24, duration: 1.35, easing: easeOutExpo });
        }
      }
    }, {signal:events.signal});
  }

  return lenis;
}
