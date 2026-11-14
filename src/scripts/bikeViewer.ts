/**
 * BikeViewer – a self-contained Three.js viewer for ONE glTF bike.
 *
 *  - Loads <base>/scene.gltf (falls back to scene.glb / model.glb). Relative .bin and
 *    texture paths resolve against the model's own folder automatically.
 *  - Yields to the browser main thread between download, material prep, PMREM studio
 *    environment baking, and shader compilation so loading never drops frames.
 *  - Renderer pixel ratio capped to Math.min(window.devicePixelRatio, 1.5).
 */
import {
  ACESFilmicToneMapping,
  Box3,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** Scroll-driven state, written by GSAP. */
export interface BikeState {
  /** Horizontal slide: -1 = just off-screen left, 0 = centre, 1 = just off-screen right */
  x: number;
  /** Extra yaw in radians (scroll-driven 360° rotation) */
  spin: number;
}

export interface ViewerOptions {
  canvas: HTMLCanvasElement;
  /** Folder that contains scene.gltf, e.g. "/models/bike1" */
  folder: string;
  state: BikeState;
  mobile: boolean;
  /** Enable pointer-drag rotation (touch friendly) */
  drag?: boolean;
  /** Base yaw so the bike isn't perfectly side-on at rest */
  baseYaw?: number;
}

/** Normalised pointer (-1..1), shared by every viewer for the mouse-parallax tilt. */
export const pointer = { x: 0, y: 0 };

const MODEL_LENGTH = 4; // world units – every bike is scaled to this length

/** Yield one frame to the browser so heavy work never blocks scrolling or animations. */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export class BikeViewer {
  /** Only active viewers render – bikes.ts toggles this by visibility. */
  active = false;
  ready = false;

  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private envTexture?: Texture;
  private root = new Group(); // slides along X
  private tilt = new Group(); // pointer tilt
  private pivot = new Group(); // scroll spin
  private holder = new Group(); // orientation + scale + centring of the loaded model
  private shadow?: Mesh;
  private ro: ResizeObserver;

  private height = 2; // normalised model height
  private visibleW = 8; // world width visible at the model's distance
  private tx = 0;
  private ty = 0;
  private drag = 0;
  private lastYaw = NaN;
  private lastX = NaN;
  private dirty = true;
  private disposed = false;
  private cleanups: Array<() => void> = [];

  /** Signal that scroll or pointer input changed so the next frame should render. */
  markDirty() {
    this.dirty = true;
  }

  private constructor(private o: ViewerOptions, renderer: WebGLRenderer) {
    this.renderer = renderer;
    // Cap pixel ratio to 1.5 across PC & mobile to keep 7-12MB glTF rendering silky smooth
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setClearColor(0x000000, 0); // transparent: the glass stage shows through

    this.camera = new PerspectiveCamera(o.mobile ? 34 : 26, 1, 0.1, 100);

    this.pivot.add(this.holder);
    this.tilt.add(this.pivot);
    this.root.add(this.tilt);
    this.scene.add(this.root);

    this.setupLights();

    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(o.canvas);
    if (o.drag) this.setupDrag();
  }

  /** Create a viewer, or null when WebGL is unavailable. */
  static create(o: ViewerOptions): BikeViewer | null {
    try {
      const renderer = new WebGLRenderer({
        canvas: o.canvas,
        antialias: !o.mobile,
        alpha: true,
        powerPreference: 'high-performance',
      });
      return new BikeViewer(o, renderer);
    } catch (e) {
      console.warn('[bikes] WebGL unavailable', e);
      return null;
    }
  }

  /* ---------------------------------------------------------------- lighting */
  private setupLights() {
    // Warm studio key light
    const key = new DirectionalLight(0xfff6ec, 3.0);
    key.position.set(4.5, 6.5, 5.5);

    // Overhead soft studio bank for tank & handlebar speculars
    const topLight = new DirectionalLight(0xffffff, 1.6);
    topLight.position.set(0, 8, 1.5);

    // Cool studio fill light from front-left so dark engine crevices stay detailed
    const fill = new DirectionalLight(0xc7d8ff, 1.35);
    fill.position.set(-5.5, 2.5, 4.5);

    // Neon rim lights (cyan from left-back, electric cobalt from right-back)
    const rimCyan = new DirectionalLight(0x7df3e1, 3.6);
    rimCyan.position.set(-4.5, 3.2, -5);
    const rimBlue = new DirectionalLight(0x4f75ff, 3.0);
    rimBlue.position.set(5, 2.2, -4.5);

    const hemi = new HemisphereLight(0xdbe6ff, 0x0b1338, 0.65);

    this.scene.add(key, topLight, fill, rimCyan, rimBlue, hemi);
  }

  /** Bake the studio HDRI environment asynchronously during load() so constructor stays instant. */
  private initEnvironment() {
    if (this.envTexture || this.disposed) return;
    const pmrem = new PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const roomEnv = new RoomEnvironment();
    const envRT = pmrem.fromScene(roomEnv, 0.035);
    this.envTexture = envRT.texture;
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = 1.4;
    roomEnv.dispose();
    pmrem.dispose();
  }

  /* ----------------------------------------------------------------- loading */
  /**
   * Loads the model asynchronously, yielding between heavy steps so the main thread
   * maintains 60 FPS smoothness.
   */
  async load(): Promise<void> {
    const base = this.o.folder.replace(/\/$/, '');
    const candidates = [`${base}/scene.gltf`, `${base}/scene.glb`, `${base}/model.glb`, `${base}/model.gltf`];

    const loader = new GLTFLoader();
    loader.setCrossOrigin('anonymous');

    let gltf: Awaited<ReturnType<GLTFLoader['loadAsync']>> | null = null;
    let lastError: unknown;
    for (const url of candidates) {
      try {
        gltf = await loader.loadAsync(url);
        break;
      } catch (e) {
        lastError = e;
      }
    }
    if (!gltf) throw lastError ?? new Error(`No model found in ${base}`);
    if (this.disposed) return;

    await nextFrame();
    if (this.disposed) return;

    this.initEnvironment();

    await nextFrame();
    if (this.disposed) return;

    const model = gltf.scene;
    this.prepareMaterials(model);
    this.fit(model);
    this.layout();

    await nextFrame();
    if (this.disposed) return;

    // Pre-compile shaders asynchronously so the first visible frame doesn't hitch
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {}
    if (this.disposed) return;

    this.ready = true;
    this.dirty = true;
    this.renderFrame(0);
  }

  private prepareMaterials(model: Object3D) {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const seen = new Set<Texture>();

    model.traverse((obj: any) => {
      if (!obj.isMesh) return;
      obj.frustumCulled = true;
      const mats: Material[] = Array.isArray(obj.material) ? obj.material : [obj.material];

      for (const m of mats as any[]) {
        if (!m) continue;

        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
          const t: Texture | undefined = m[key];
          if (t && !seen.has(t)) {
            t.anisotropy = Math.min(this.o.mobile ? 4 : 8, maxAniso);
            seen.add(t);
          }
        }

        if ('envMapIntensity' in m) {
          m.envMapIntensity = Math.max(m.envMapIntensity ?? 1, 1.55);
        }

        // Upgrade flat/grey untextured PBR materials so metallic & engine parts reflect studio light realistically
        if ('metalness' in m && 'roughness' in m && !m.map) {
          const c: Color | undefined = m.color;
          const isAchromatic = c ? Math.abs(c.r - c.g) < 0.06 && Math.abs(c.g - c.b) < 0.06 : false;
          const lum = c ? 0.299 * c.r + 0.587 * c.g + 0.114 * c.b : 0.5;

          if (isAchromatic && lum > 0.12) {
            m.metalness = Math.max(m.metalness ?? 0, 0.78);
            m.roughness = Math.min(m.roughness ?? 0.5, 0.26);
            if (c && lum < 0.35) {
              c.multiplyScalar(1.25);
            }
          } else if (m.roughness > 0.65) {
            m.roughness = 0.38;
            m.metalness = Math.max(m.metalness ?? 0, 0.15);
          }
        }

        if (this.o.mobile && m.transmission > 0) {
          m.transmission = 0;
          m.transparent = true;
          m.opacity = Math.min(m.opacity ?? 1, 0.55);
        }
        m.needsUpdate = true;
      }
    });
  }

  /** Orient long axis to X, scale to MODEL_LENGTH, centre, put wheels on y = -height/2. */
  private fit(model: Object3D) {
    const holder = this.holder;
    holder.clear();
    holder.add(model);
    holder.rotation.set(0, 0, 0);
    holder.scale.setScalar(1);
    holder.position.set(0, 0, 0);
    holder.updateMatrixWorld(true);

    const box = new Box3().setFromObject(holder, true);
    const size = box.getSize(new Vector3());

    if (size.z > size.x) {
      holder.rotation.y = Math.PI / 2;
      holder.updateMatrixWorld(true);
      box.setFromObject(holder, true);
      box.getSize(size);
    }

    holder.scale.setScalar(MODEL_LENGTH / size.x);
    holder.updateMatrixWorld(true);
    box.setFromObject(holder, true);
    box.getSize(size);
    holder.position.sub(box.getCenter(new Vector3()));

    this.height = size.y;

    this.shadow?.removeFromParent();
    const shadow = new Mesh(
      new PlaneGeometry(MODEL_LENGTH * 1.5, MODEL_LENGTH * 0.9),
      new MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -size.y / 2 + 0.004;
    this.root.add(shadow);
    this.shadow = shadow;
  }

  /* ------------------------------------------------------------------ layout */
  layout() {
    if (this.disposed) return;
    const { canvas, mobile } = this.o;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;

    this.renderer.setSize(w, h, false);
    const cam = this.camera;
    cam.aspect = w / h;
    cam.fov = mobile ? 34 : 26;
    cam.updateProjectionMatrix();

    const t = Math.tan(MathUtils.degToRad(cam.fov) / 2);
    const marginX = mobile ? 1.08 : 1.18;
    const marginY = mobile ? 1.3 : 1.38;
    const distX = (MODEL_LENGTH * marginX) / (2 * t * cam.aspect);
    const distY = (this.height * marginY) / (2 * t);
    const d = Math.max(distX, distY);

    cam.position.set(0, this.height * 0.2, d);
    cam.lookAt(0, -this.height * 0.03, 0);
    this.visibleW = 2 * d * t * cam.aspect;
    this.dirty = true;
  }

  /* ------------------------------------------------------------------ render */
  private renderFrame(dt: number) {
    const k = dt > 0 ? 1 - Math.exp(-dt * 6) : 1;
    const targetTx = pointer.y * 0.07;
    const targetTy = pointer.x * 0.2;
    this.tx += (targetTx - this.tx) * k;
    this.ty += (targetTy - this.ty) * k;
    this.tilt.rotation.set(this.tx, this.ty, 0);

    const yaw = (this.o.baseYaw ?? 0.55) + this.o.state.spin + this.drag;
    const posX = this.o.state.x * (this.visibleW / 2 + MODEL_LENGTH / 2);

    const tiltMoving = Math.abs(targetTx - this.tx) > 1e-4 || Math.abs(targetTy - this.ty) > 1e-4;
    const stateMoved = Math.abs(yaw - this.lastYaw) > 1e-4 || Math.abs(posX - this.lastX) > 1e-4;

    if (!this.dirty && !tiltMoving && !stateMoved) return;

    this.pivot.rotation.y = yaw;
    this.root.position.x = posX;
    this.lastYaw = yaw;
    this.lastX = posX;
    this.dirty = false;

    this.renderer.render(this.scene, this.camera);
  }

  render(dt: number) {
    if (!this.ready || !this.active || this.disposed) return;
    this.renderFrame(dt);
  }

  /* -------------------------------------------------------------- interaction */
  private setupDrag() {
    const c = this.o.canvas;
    let down = false;
    let lastX = 0;
    const onDown = (e: PointerEvent) => {
      down = true;
      lastX = e.clientX;
      c.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      this.drag += (e.clientX - lastX) * 0.012;
      lastX = e.clientX;
      this.dirty = true;
    };
    const onUp = () => (down = false);
    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp);
    c.addEventListener('pointercancel', onUp);
    this.cleanups.push(() => {
      c.removeEventListener('pointerdown', onDown);
      c.removeEventListener('pointermove', onMove);
      c.removeEventListener('pointerup', onUp);
      c.removeEventListener('pointercancel', onUp);
    });
  }

  dispose() {
    this.disposed = true;
    this.active = false;
    this.ro.disconnect();
    this.cleanups.forEach((fn) => fn());
    this.envTexture?.dispose();
    this.scene.traverse((obj: any) => {
      if (!obj.isMesh) return;
      obj.geometry?.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m: any) => {
        for (const key in m) if (m[key]?.isTexture) m[key].dispose();
        m.dispose?.();
      });
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/** Radial black → transparent gradient used as a fake contact shadow. */
function makeShadowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(0.45, 'rgba(0,0,0,0.38)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}
