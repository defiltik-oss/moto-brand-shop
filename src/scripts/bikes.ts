/**
 * Bikes section controller (GSAP ScrollTrigger + Three.js viewers).
 *
 * Strict Lazy Loading & Sequential Async Queue:
 *  - Prevents 3D bike models from loading on initial page load.
 *  - Uses `IntersectionObserver` (`rootMargin: '160px 0px'`) so Three.js and the heavy
 *    glTF/GLB models only start fetching when the user is about to scroll into `#bikes`.
 *  - Loads models sequentially (one at a time with idle pauses between them) instead of
 *    simultaneously so the main thread never stutters and stays at a locked 60 FPS.
 *  - Keeps a lightweight Liquid Glass skeleton/spinner visible until the model is ready.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { BikeState, BikeViewer } from './bikeViewer';

type ViewerModule = typeof import('./bikeViewer');
let modulePromise: Promise<ViewerModule> | null = null;
const loadModule = () => (modulePromise ??= import('./bikeViewer'));

/** Sequential async queue so two heavy glTF models never download/parse/compile simultaneously. */
let loadChain: Promise<void> = Promise.resolve();
function enqueueLoad<T>(task: () => Promise<T>): Promise<T> {
  const next = loadChain.then(task, task);
  loadChain = next.then(
    () => new Promise<void>((r) => setTimeout(r, 120)),
    () => new Promise<void>((r) => setTimeout(r, 120)),
  );
  return next;
}

/** Fire once when `el` is about to enter the viewport (`margin` px before). */
function whenApproaching(el: Element, margin: number, cb: () => void): () => void {
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        cb();
      }
    },
    { rootMargin: `${margin}px 0px`, threshold: 0.01 },
  );
  io.observe(el);
  return () => io.disconnect();
}

const TAU = Math.PI * 2;

export function initBikes(): void {
  const root = document.querySelector<HTMLElement>('#bikes');
  if (!root) return;

  const mm = gsap.matchMedia();
  mm.add('(min-width: 768px)', () => desktop(root));
  mm.add('(max-width: 767px)', () => mobile(root));
}

/* ====================================================================== desktop */
function desktop(root: HTMLElement): () => void {
  const section = root.querySelector<HTMLElement>('[data-bikes-desktop]')!;
  const q = <T extends HTMLElement>(s: string) => section.querySelector<T>(s)!;
  const win = q('[data-bikes-window]');
  const inner = q('[data-bikes-inner]');
  const glow = q('[data-depth]');
  const splitL = q('[data-split="l"]');
  const splitR = q('[data-split="r"]');
  const label = q('[data-bikes-label]');
  const chips = [q('[data-bike-chip="bike1"]'), q('[data-bike-chip="bike2"]')];
  const loader = q('[data-bikes-loader]');
  const errorEl = q('[data-bikes-error]');
  const canvases = [q<HTMLCanvasElement>('[data-bike-canvas="bike1"]'), q<HTMLCanvasElement>('[data-bike-canvas="bike2"]')];

  const states: BikeState[] = [
    { x: -1, spin: 0 },
    { x: 1, spin: 0 },
  ];
  const viewers: (BikeViewer | null)[] = [null, null];
  const canvasInView = [false, false];
  let sectionInView = false;
  let tickerRunning = false;
  let progress = 0;
  let mod: ViewerModule | null = null;
  let cancelNear = () => {};

  const tick = (_t: number, dt: number) => viewers.forEach((v) => v?.render(dt / 1000));

  const setRenderLoop = (shouldRun: boolean) => {
    const active = shouldRun && !document.hidden;
    if (active && !tickerRunning) {
      gsap.ticker.add(tick);
      tickerRunning = true;
    } else if (!active && tickerRunning) {
      gsap.ticker.remove(tick);
      tickerRunning = false;
    }
  };

  const refreshActive = () => {
    const isVisible = sectionInView && canvasInView.some(Boolean);
    const b0Active = isVisible && canvasInView[0] && progress < 0.68;
    const b1Active = isVisible && canvasInView[1] && progress > 0.52;
    if (viewers[0]) viewers[0].active = b0Active;
    if (viewers[1]) viewers[1].active = b1Active;
    setRenderLoop(b0Active || b1Active);
  };

  gsap.set(chips, { xPercent: -50 });

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let tl: gsap.core.Timeline | null = null;

  if (reduce) {
    win.style.clipPath = 'none';
    gsap.set([splitL, splitR, label], { opacity: 0 });
    states[0].x = -0.5;
    states[1].x = 0.5;
    states[0].spin = 0.4;
    states[1].spin = -0.4;
    gsap.set(chips, { opacity: 1, x: (i: number) => (i ? '14vw' : '-14vw') });
    progress = 0.6;
  } else {
    const from = 'inset(44% 34% 9% 34% round 40px)';
    const to = 'inset(0% 0% 0% 0% round 0px)';

    tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: '+=360%',
        scrub: 1,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
      onUpdate: () => {
        progress = tl!.progress();
        viewers.forEach((v) => v?.markDirty());
        refreshActive();
      },
    });

    tl.fromTo(win, { clipPath: from }, { clipPath: to, duration: 0.3, ease: 'power2.inOut' }, 0)
      .fromTo(inner, { scale: 1.25 }, { scale: 1, duration: 0.4, ease: 'power2.out' }, 0)
      .to(splitL, { xPercent: -130, opacity: 0, duration: 0.24, ease: 'power2.in' }, 0)
      .to(splitR, { xPercent: 130, opacity: 0, duration: 0.24, ease: 'power2.in' }, 0)
      .to(label, { opacity: 0, y: -20, duration: 0.14 }, 0)

      // Bike 1: slide in → full 360° turn → exit right
      .fromTo(states[0], { x: -1 }, { x: 0, duration: 0.18, ease: 'power2.out' }, 0.14)
      .fromTo(states[0], { spin: 0 }, { spin: TAU, duration: 0.44 }, 0.14)
      .fromTo(states[0], { x: 0 }, { x: 1, duration: 0.14, ease: 'power2.in', immediateRender: false }, 0.5)
      .fromTo(chips[0], { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.06 }, 0.3)
      .to(chips[0], { opacity: 0, y: -10, duration: 0.05 }, 0.5)

      // Bike 2: slide in from the right → 360° turn (opposite direction), then hold
      .fromTo(states[1], { x: 1 }, { x: 0, duration: 0.16, ease: 'power2.out' }, 0.56)
      .fromTo(states[1], { spin: 0 }, { spin: -TAU, duration: 0.44 }, 0.56)
      .fromTo(chips[1], { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.06 }, 0.72)

      // Subtle depth drift on the ambient glow
      .to(glow, { xPercent: -8, duration: 1 }, 0);
  }

  // Strict IntersectionObserver on section AND individual 3D canvases
  const viewportIO = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.target === section) {
          sectionInView = entry.isIntersecting;
        } else {
          const idx = canvases.indexOf(entry.target as HTMLCanvasElement);
          if (idx !== -1) canvasInView[idx] = entry.isIntersecting;
        }
      }
      refreshActive();
    },
    { threshold: 0.01 },
  );
  viewportIO.observe(section);
  canvases.forEach((c) => viewportIO.observe(c));

  const onVisChange = () => refreshActive();
  document.addEventListener('visibilitychange', onVisChange);

  const onMove = (e: PointerEvent) => {
    if (!mod || !sectionInView) return;
    mod.pointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
    mod.pointer.y = (e.clientY / window.innerHeight - 0.5) * 2;
    viewers.forEach((v) => v?.markDirty());
  };
  const onLeave = () => {
    if (mod) {
      mod.pointer.x = mod.pointer.y = 0;
      viewers.forEach((v) => v?.markDirty());
    }
  };
  section.addEventListener('pointermove', onMove, { passive: true });
  section.addEventListener('pointerleave', onLeave);

  let disposed = false;

  // Strict Lazy Load: only start fetching Three.js + Bike 1 when user scrolls within 160px of #bikes
  cancelNear = whenApproaching(section, 160, async () => {
    mod = await loadModule();
    if (disposed) return;

    const loadSingleBike = (index: number) =>
      enqueueLoad(async () => {
        if (disposed) return;
        const canvas = canvases[index];
        const v = mod!.BikeViewer.create({
          canvas,
          folder: canvas.dataset.folder!,
          state: states[index],
          mobile: false,
          baseYaw: index ? 2.6 : 0.55,
        });
        if (!v) throw new Error('webgl');
        viewers[index] = v;
        await v.load();
      });

    // 1. Load Bike 1 first and immediately reveal the stage so Bike 1 is ready without waiting for Bike 2
    let bike1Failed = false;
    try {
      await loadSingleBike(0);
    } catch (e) {
      bike1Failed = true;
      console.warn('[bikes] bike1 failed:', e);
    }
    if (disposed) return;

    loader.classList.add('bike-loader-hidden');
    refreshActive();

    // 2. Load Bike 2 sequentially in the background after an idle pause (never simultaneously!)
    try {
      await loadSingleBike(1);
    } catch (e) {
      console.warn('[bikes] bike2 failed:', e);
      if (bike1Failed) errorEl.classList.remove('hidden');
    }
    if (disposed) return;
    refreshActive();
  });

  return () => {
    disposed = true;
    cancelNear();
    viewportIO.disconnect();
    document.removeEventListener('visibilitychange', onVisChange);
    setRenderLoop(false);
    section.removeEventListener('pointermove', onMove);
    section.removeEventListener('pointerleave', onLeave);
    tl?.scrollTrigger?.kill();
    tl?.kill();
    viewers.forEach((v) => v?.dispose());
  };
}

/* ======================================================================= mobile */
function mobile(root: HTMLElement): () => void {
  const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-bike-card]'));
  const canvases = cards.map((c) => c.querySelector<HTMLCanvasElement>('[data-bike-canvas]')!);
  const states: BikeState[] = cards.map(() => ({ x: 0, spin: 0 }));
  const viewers: (BikeViewer | null)[] = cards.map(() => null);
  const inView = cards.map(() => false);
  const cancelApproaching: Array<() => void> = [];
  let tickerRunning = false;
  let disposed = false;

  const tick = (_t: number, dt: number) => viewers.forEach((v) => v?.render(dt / 1000));

  const syncTicker = () => {
    const anyVisible = !document.hidden && inView.some((v, i) => v && Boolean(viewers[i]?.ready));
    if (anyVisible && !tickerRunning) {
      gsap.ticker.add(tick);
      tickerRunning = true;
    } else if (!anyVisible && tickerRunning) {
      gsap.ticker.remove(tick);
      tickerRunning = false;
    }
  };

  // Strict IntersectionObserver on each mobile 3D canvas: completely freezes off-screen canvases
  const canvasIO = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const idx = canvases.indexOf(entry.target as HTMLCanvasElement);
        if (idx !== -1) {
          inView[idx] = entry.isIntersecting;
          if (viewers[idx]) {
            viewers[idx]!.active = entry.isIntersecting;
            if (entry.isIntersecting) viewers[idx]!.markDirty();
          }
        }
      }
      syncTicker();
    },
    { threshold: 0.01 },
  );
  canvases.forEach((c) => canvasIO.observe(c));

  const onVisChange = () => syncTicker();
  document.addEventListener('visibilitychange', onVisChange);

  // Scroll-driven 360° per card
  const triggers = cards.map((card, i) => {
    const tween = gsap.fromTo(
      states[i],
      { spin: i % 2 ? Math.PI : -Math.PI },
      {
        spin: i % 2 ? -Math.PI : Math.PI,
        ease: 'none',
        onUpdate: () => viewers[i]?.markDirty(),
        scrollTrigger: {
          trigger: card,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 0.5,
        },
      },
    );
    return tween.scrollTrigger!;
  });

  // Strict per-card lazy loading: each mobile card only loads its model when scrolled within 120px, queued sequentially
  cards.forEach((card, i) => {
    const cancel = whenApproaching(card, 120, () => {
      enqueueLoad(async () => {
        if (disposed) return;
        const mod = await loadModule();
        if (disposed) return;

        const canvas = canvases[i];
        const loader = card.querySelector<HTMLElement>('[data-card-loader]')!;
        const errorEl = card.querySelector<HTMLElement>('[data-card-error]')!;
        try {
          const v = mod.BikeViewer.create({
            canvas,
            folder: canvas.dataset.folder!,
            state: states[i],
            mobile: true,
            drag: true,
            baseYaw: 0.4,
          });
          if (!v) throw new Error('webgl');
          viewers[i] = v;
          await v.load();
          v.active = inView[i];
          syncTicker();
        } catch (e) {
          console.warn('[bikes] mobile model failed', e);
          errorEl.classList.remove('hidden');
        } finally {
          loader.classList.add('bike-loader-hidden');
        }
      });
    });
    cancelApproaching.push(cancel);
  });

  return () => {
    disposed = true;
    cancelApproaching.forEach((fn) => fn());
    canvasIO.disconnect();
    document.removeEventListener('visibilitychange', onVisChange);
    if (tickerRunning) gsap.ticker.remove(tick);
    triggers.forEach((t) => t.kill());
    viewers.forEach((v) => v?.dispose());
  };
}
