/**
 * Theme switcher. Dark ⇄ Light with a "liquid" circular reveal expanding from
 * the toggle (View Transitions API) and a squash-and-stretch bubble knob.
 * Falls back to a colour cross-fade where unsupported / reduced motion.
 * The initial theme is applied by an inline script in Layout.astro (no flash).
 */
export function initTheme(): void {
  const root = document.documentElement;
  const btn = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
  const knob = document.querySelector<HTMLElement>('[data-theme-knob]');
  if (!btn) return;

  const apply = (theme: 'dark' | 'light') => {
    root.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {}
    btn.setAttribute('aria-pressed', String(theme === 'light'));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f0f7ff' : '#101a40');
  };
  apply(root.dataset.theme === 'light' ? 'light' : 'dark');

  btn.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Liquid bubble: stretches while travelling, settles with the CSS overshoot
    if (knob && !reduce) {
      knob.animate(
        [
          { transform: 'scale(1,1)' },
          { transform: 'scale(1.55,0.82)', offset: 0.35 },
          { transform: 'scale(0.92,1.08)', offset: 0.7 },
          { transform: 'scale(1,1)' },
        ],
        { duration: 750, easing: 'ease-in-out' },
      );
    }

    if (!('startViewTransition' in document) || reduce) {
      root.classList.add('theme-fade');
      apply(next);
      setTimeout(() => root.classList.remove('theme-fade'), 800);
      return;
    }

    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

    const transition = (document as any).startViewTransition(() => apply(next));
    transition.ready.then(() =>
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 1100, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' },
      ),
    );
  });
}
