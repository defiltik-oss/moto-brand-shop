/**
 * Preloader with Mascot 360° Rotation:
 * 1. Shows `/mascot.png` spinning smoothly 360° in the center while critical assets load.
 * 2. Upon completion (100%), smoothly transitions `mascot.png` into `/logo.png` in the center.
 * 3. Animates `/logo.png` gliding smoothly up into the sticky header bar (`[data-header-logo]`)
 *    while revealing the Hero section.
 */
import gsap from 'gsap';

export function runPreloader(onGlideStart?: () => void): Promise<void> {
  return new Promise((resolve) => {
    const root = document.querySelector<HTMLElement>('[data-preloader]');
    const mascot = document.querySelector<HTMLElement>('[data-preloader-mascot]');
    const ring = document.querySelector<HTMLElement>('[data-preloader-ring]');
    const glow = document.querySelector<HTMLElement>('[data-preloader-glow]');
    const flyer = document.querySelector<HTMLElement>('[data-flying-logo]');
    const target = document.querySelector<HTMLElement>('[data-header-logo]');

    if (!root || !flyer || !target) {
      onGlideStart?.();
      return resolve();
    }

    // Center the flying logo via GSAP transform and keep hidden until mascot finishes its 360° spin
    gsap.set(flyer, { xPercent: -50, yPercent: -50, opacity: 0, scale: 0.72 });
    gsap.set(target, { opacity: 0 });
    if (mascot) gsap.set(mascot, { opacity: 0, scale: 0.82, rotation: 0, rotationY: 0 });
    if (ring) gsap.set(ring, { opacity: 0, scale: 0.85 });
    if (glow) gsap.set(glow, { opacity: 0, scale: 0.85 });

    const tl = gsap.timeline();

    // Step 1: Entrance + smooth 360-degree mascot rotation in the center
    if (mascot) {
      tl.to(mascot, { opacity: 1, scale: 1, duration: 0.45, ease: 'power2.out' }, 0)
        .to(
          [ring, glow].filter(Boolean),
          { opacity: 1, scale: 1, duration: 0.55, ease: 'power2.out' },
          0.05,
        )
        .to(
          mascot,
          {
            rotation: 360,
            duration: 1.35,
            ease: 'power2.inOut',
          },
          0.1,
        );
    }

    // Step 2: At 100% completion, smoothly morph/transition mascot.png into logo.png
    tl.to(
      [mascot, ring].filter(Boolean),
      {
        opacity: 0,
        scale: 0.68,
        duration: 0.42,
        ease: 'power2.inOut',
      },
      1.4,
    )
      .to(
        flyer,
        {
          opacity: 1,
          scale: 1,
          duration: 0.5,
          ease: 'back.out(1.35)',
        },
        1.52,
      )
      .to(
        glow,
        {
          opacity: 0,
          scale: 1.15,
          duration: 0.45,
          ease: 'power2.inOut',
        },
        1.85,
      )
      // Step 3: Animate logo.png gliding smoothly up into the header bar
      .add(() => {
        const from = flyer.getBoundingClientRect();
        const to = target.getBoundingClientRect();
        const dx = to.left + to.width / 2 - (from.left + from.width / 2);
        const dy = to.top + to.height / 2 - (from.top + from.height / 2);
        const scale = to.width / from.width;

        gsap.to(flyer, {
          x: dx,
          y: dy,
          scale,
          duration: 1.1,
          ease: 'power3.inOut',
          onComplete: () => {
            gsap.set(target, { opacity: 1 });
            flyer.remove();
            resolve();
          },
        });

        gsap.to(root, {
          opacity: 0,
          duration: 0.85,
          ease: 'power2.inOut',
          onStart: () => {
            onGlideStart?.();
          },
          onComplete: () => root.remove(),
        });
      }, 2.02);
  });
}
