const SURFACES = '.glass, .glass-card, .glass-modal, .liquid-glass, .liquid-glass-elevated, .glass-sub, .liquid-pill, .apple-header, .apple-megamenu, .splash-mascot-card';
const SVG_NS = 'http://www.w3.org/2000/svg';
const REFRACTIVE_INDEX = 1.46;
const MAX_DISPLACEMENT = 24;
const BLUR_AMOUNT = 0.25;

function svgElement<K extends keyof SVGElementTagNameMap>(name: K, attributes: Record<string, string | number>) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function paintDisplacement(canvas: HTMLCanvasElement, width: number, height: number, radius: number) {
  const scale = Math.min(1, 480 / Math.max(width, height), Math.sqrt(100_000 / (width * height)));
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const context = canvas.getContext('2d');
  if (!context) return;
  const pixels = context.createImageData(canvas.width, canvas.height);
  const bevel = Math.min(18, Math.max(6, radius * .62), height * .46, width * .46);
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  for (let y = 0; y < canvas.height; y++) {
    const dy = (y + .5) * height / canvas.height - halfHeight;
    for (let x = 0; x < canvas.width; x++) {
      const dx = (x + .5) * width / canvas.width - halfWidth;
      const qx = Math.abs(dx) - halfWidth + radius;
      const qy = Math.abs(dy) - halfHeight + radius;
      const cornerX = Math.max(0, qx);
      const cornerY = Math.max(0, qy);
      const cornerDistance = Math.hypot(cornerX, cornerY);
      const edgeDepth = radius - cornerDistance - Math.min(Math.max(qx, qy), 0);
      const index = (y * canvas.width + x) * 4;
      pixels.data[index] = 128;
      pixels.data[index + 1] = 128;
      pixels.data[index + 2] = 128;
      pixels.data[index + 3] = 255;
      if (edgeDepth < 0 || edgeDepth >= bevel) continue;

      // The signed distance to the rounded edge supplies the lens normal.
      const normalX = cornerDistance ? cornerX / cornerDistance : Number(qx > qy);
      const normalY = cornerDistance ? cornerY / cornerDistance : Number(qy >= qx);
      const t = edgeDepth / bevel;
      const incidence = Math.atan(2.8 * (1 - t) ** 2);
      const refracted = Math.asin(Math.sin(incidence) / REFRACTIVE_INDEX);
      const offset = Math.min(MAX_DISPLACEMENT / 2, 18 * Math.tan(incidence - refracted));
      const channelOffset = offset * 255 / MAX_DISPLACEMENT;
      pixels.data[index] = Math.round(127.5 - Math.sign(dx) * normalX * channelOffset);
      pixels.data[index + 1] = Math.round(127.5 - Math.sign(dy) * normalY * channelOffset);
    }
  }

  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png');
}

interface Lens {
  visible: boolean;
  filter?: SVGFilterElement;
  map?: SVGFEImageElement;
  geometry?: string;
}

export function initGlass(): void {
  const events = new AbortController();
  const root = document.documentElement;
  const shortSide = Math.min(screen.width, screen.height);
  const longSide = Math.max(screen.width, screen.height);
  const compactIPhone = /iPhone|iPod/.test(navigator.userAgent) && shortSide <= 414 && longSide <= 736;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const budgetMobile = matchMedia('(pointer: coarse)').matches
    && ((memory !== undefined && memory <= 2) || (navigator.hardwareConcurrency || 8) <= 4);
  if (compactIPhone || budgetMobile || matchMedia('(pointer: coarse)').matches || !window.IntersectionObserver || !window.ResizeObserver) {
    root.classList.add('glass-lite');
    return;
  }

  const ambient = document.querySelector<HTMLImageElement>('.shtorm-seamless-img');
  const liveBackdrop = /(?:Chrome|Chromium)\/\d+/.test(navigator.userAgent)
    && CSS.supports('backdrop-filter', 'url("#glass-lens")');
  const canvas = document.createElement('canvas');
  const host = svgElement('svg', { width: 0, height: 0, 'aria-hidden': 'true', class: 'glass-definitions' });
  const defs = svgElement('defs', {});
  host.append(defs);
  document.body.prepend(host);

  const lenses = new Map<HTMLElement, Lens>();
  let nextId = 0;
  let scheduled = 0;
  let scanNeeded = true;

  function release(element: HTMLElement, lens: Lens) {
    if (!lens.filter) return;
    lens.filter.remove();
    lens.filter = undefined;
    lens.map = undefined;
    lens.geometry = undefined;
    delete element.dataset.glassRenderer;
    element.style.removeProperty('--glass-filter');
    for (const property of ['--glass-image', '--glass-image-size', '--glass-image-position']) element.style.removeProperty(property);
  }

  function scan() {
    for (const [element, lens] of lenses) {
      if (element.isConnected && element.matches(SURFACES)) continue;
      release(element, lens);
      visibility.unobserve(element);
      resizing.unobserve(element);
      lenses.delete(element);
    }
    for (const element of document.querySelectorAll<HTMLElement>(SURFACES)) {
      if (lenses.has(element)) continue;
      lenses.set(element, { visible: false });
      visibility.observe(element);
      resizing.observe(element);
    }
  }

  function update() {
    scheduled = 0;
    if (scanNeeded) {
      scanNeeded = false;
      scan();
    }
    const enabled = !root.classList.contains('performance-mode');
    const texture = !liveBackdrop && enabled && ambient?.naturalWidth ? ambient : null;
    const frame = texture?.getBoundingClientRect();
    const zoom = frame && texture ? Math.max(frame.width / texture.naturalWidth, frame.height / texture.naturalHeight) : 0;
    const imageWidth = (texture?.naturalWidth ?? 0) * zoom;
    const imageHeight = (texture?.naturalHeight ?? 0) * zoom;

    for (const [element, lens] of lenses) {
      if (!enabled || !lens.visible || element.closest('[hidden], .hidden, .opacity-0, .is-hidden')) {
        release(element, lens);
        continue;
      }

      const width = element.offsetWidth;
      const height = element.offsetHeight;
      if (width < 12 || height < 12) continue;
      const radiusStyle = getComputedStyle(element).borderTopLeftRadius;
      const parsedRadius = parseFloat(radiusStyle) || 0;
      const radius = Math.min(width / 2, height / 2, radiusStyle.endsWith('%') ? Math.min(width, height) * parsedRadius / 100 : parsedRadius);
      const geometry = `${width}:${height}:${radius}`;
      if (lens.geometry !== geometry) {
        const image = paintDisplacement(canvas, width, height, radius);
        if (!image) continue;
        if (!lens.filter || !lens.map) {
          const id = `alexov-glass-${++nextId}`;
          lens.filter = svgElement('filter', {
            id, x: '-20%', y: '-20%', width: '140%', height: '140%',
            primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB',
          });
          lens.map = svgElement('feImage', { x: 0, y: 0, preserveAspectRatio: 'none', result: 'normals' });
          lens.filter.append(
            lens.map,
            svgElement('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: 10 * BLUR_AMOUNT, edgeMode: 'duplicate', result: 'diffused' }),
            svgElement('feDisplacementMap', {
              in: 'diffused', in2: 'normals', scale: MAX_DISPLACEMENT, xChannelSelector: 'R', yChannelSelector: 'G',
            }),
          );
          defs.append(lens.filter);
          element.style.setProperty('--glass-filter', `url("#${id}")`);
        }
        lens.map.setAttribute('width', String(width));
        lens.map.setAttribute('height', String(height));
        lens.map.setAttribute('href', image);
        lens.geometry = geometry;
      }
      if (liveBackdrop) {
        element.dataset.glassRenderer = 'live';
      } else if (frame && texture) {
        const bounds = element.getBoundingClientRect();
        element.style.setProperty('--glass-image', `url(${JSON.stringify(texture.currentSrc || texture.src)})`);
        element.style.setProperty('--glass-image-size', `${imageWidth}px ${imageHeight}px`);
        element.style.setProperty('--glass-image-position', `${frame.left + (frame.width - imageWidth) / 2 - bounds.left}px ${frame.top + (frame.height - imageHeight) * .54 - bounds.top}px`);
        element.dataset.glassRenderer = 'texture';
      }
    }
  }

  function schedule() {
    if (!document.hidden && !events.signal.aborted && !scheduled) scheduled = requestAnimationFrame(update);
  }

  const visibility = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const lens = lenses.get(entry.target as HTMLElement);
      if (lens) lens.visible = entry.isIntersecting;
    }
    schedule();
  });
  const resizing = new ResizeObserver(schedule);
  const mutations = new MutationObserver((changes) => {
    const relevant = changes.filter((change) => !host.contains(change.target));
    if (!relevant.length) return;
    scanNeeded ||= relevant.some((change) => change.type === 'childList'
      || (change.target instanceof HTMLElement && change.target.matches(SURFACES) && !lenses.has(change.target)));
    schedule();
  });
  mutations.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'open', 'hidden', 'aria-hidden'] });
  const rootChanges = new MutationObserver(schedule);
  rootChanges.observe(root, { attributes: true, attributeFilter: ['class'] });
  if (!liveBackdrop) {
    ambient?.addEventListener('load', schedule, {signal:events.signal});
    window.addEventListener('resize', schedule, { passive: true, signal:events.signal });
    document.addEventListener('scroll', schedule, { capture: true, passive: true, signal:events.signal });
    document.addEventListener('transitionend', schedule, {signal:events.signal});
  }
  const pause = () => {cancelAnimationFrame(scheduled);scheduled=0;};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else schedule();},{signal:events.signal});
  window.addEventListener('pagehide',pause,{signal:events.signal});
  window.addEventListener('pageshow',schedule,{signal:events.signal});
  document.addEventListener('astro:before-swap',()=>{
    pause();events.abort();mutations.disconnect();rootChanges.disconnect();visibility.disconnect();resizing.disconnect();
    for(const [element,lens] of lenses)release(element,lens);
    lenses.clear();host.remove();
  },{once:true});
  schedule();

}
