// Renderer, camera, Earth, starfield, and the sun. Everything here is view-only.
import * as THREE from 'three';
import { Rng } from '../sim/rng';
import type { OrbitSnapshot } from '../sim/types';
import { createEarth, type Earth } from './earth';

/** View scale: 1 unit = 1 metre around the station; Earth is shrunk but keeps the real altitude ratio. */
export const EARTH_RADIUS = 900;
export const ALTITUDE = 60;

const MAX_PIXEL_RATIO = 2;
const MIN_PIXEL_RATIO = 1;

// A long lens: the narrower of the two fields of view never drops below these, and the
// camera stands back to compensate. Wide angles bulge whatever is nearest the camera.
const MIN_HFOV_DEG = 22;
const MIN_VFOV_DEG = 24;
const SUN_SCALE = 520; // sprite size at a 50 degree field of view
const DEG = Math.PI / 180;

export interface SceneEnv {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  earth: Earth;
  /** Sun direction in world space, updated every frame. */
  sunDir: THREE.Vector3;
  update(orbit: OrbitSnapshot, phase: number, sunlight: number): void;
  render(): void;
  resize(): void;
  /** Resize if the canvas's laid-out size changed since the last frame. True when it did. */
  ensureSize(): boolean;
  /** Screen pixels covered by UI along the top and bottom edges; the view centres on what's left. */
  setInsets(top: number, bottom: number): void;
  /** How far back the camera stands to fit a sphere of `radius` in the uncovered part of the screen. */
  fitDistance(radius: number): number;
  /** Lower the resolution if frames are slow. Call once per frame with the frame time in seconds. */
  adapt(dt: number): void;
  /** Auto adapts the resolution to the frame rate; low and high hold it at one and the screen's own (up to 2). */
  setQuality(q: 'auto' | 'low' | 'high'): void;
  /** Draw a frame now and return it as a PNG data URL. Must be called in one go: the buffer clears after compositing. */
  capture(): string;
  /** Draw a frame now and return a small 4:3 JPEG of its middle, for a save slot. */
  thumbnail(width: number): string;
}

function makeSunTexture(): THREE.Texture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,250,1)');
  grad.addColorStop(0.12, 'rgba(255,250,235,1)');
  grad.addColorStop(0.25, 'rgba(255,225,180,0.45)');
  grad.addColorStop(1, 'rgba(255,200,150,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeStars(count: number, radius: number): THREE.Points {
  const rng = new Rng(9001);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Uniform on a sphere.
    const z = rng.range(-1, 1);
    const t = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(1 - z * z);
    positions.set([radius * r * Math.cos(t), radius * r * Math.sin(t), radius * z], i * 3);
    const b = 0.35 + 0.65 * rng.next() ** 3;
    const warm = rng.range(-0.08, 0.08);
    colors.set([b * (1 + warm), b, b * (1 - warm)], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false });
  return new THREE.Points(geo, mat);
}

export function createScene(canvas: HTMLCanvasElement): SceneEnv {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  renderer.setPixelRatio(pixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x050506);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 8000);

  const earth = createEarth(EARTH_RADIUS);
  earth.pivot.position.set(0, -(EARTH_RADIUS + ALTITUDE), 0);
  scene.add(earth.pivot);

  const stars = makeStars(1800, 4000);
  scene.add(stars);

  const sunSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: makeSunTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
  );
  sunSprite.scale.setScalar(520);
  scene.add(sunSprite);

  const sunLight = new THREE.DirectionalLight(0xfff4e6, 2.8);
  scene.add(sunLight);
  scene.add(sunLight.target);
  // Earthshine from below, cool sky above. Keeps the station readable in eclipse.
  const hemi = new THREE.HemisphereLight(0x55536e, 0x4f73a8, 0.5);
  scene.add(hemi);

  const sunDir = new THREE.Vector3(0, 1, 0);

  let insetTop = 0;
  let insetBottom = 0;
  /** Half-angles (radians) of the uncovered part of the screen, horizontal and vertical. */
  let halfH = (MIN_HFOV_DEG / 2) * DEG;
  let halfV = (MIN_VFOV_DEG / 2) * DEG;

  let sizedW = 0;
  let sizedH = 0;
  function resize(): void {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    sizedW = w;
    sizedH = h;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    // Vertical field of view of the visible frame: portrait screens widen it so the width keeps its lens.
    const vfov = Math.max(MIN_VFOV_DEG * DEG, 2 * Math.atan(Math.tan((MIN_HFOV_DEG / 2) * DEG) / aspect));
    const tanV = Math.tan(vfov / 2);
    // Shift the centre of the picture into the gap between the UI at the top and the bottom.
    // The frustum is drawn for a taller frame and the canvas shows one end of it.
    const dy = THREE.MathUtils.clamp((insetTop - insetBottom) / 2, -h / 4, h / 4);
    const fullH = h + 2 * Math.abs(dy);
    camera.aspect = w / fullH;
    camera.fov = (2 * Math.atan((tanV * fullH) / h)) / DEG;
    camera.setViewOffset(w, fullH, 0, dy > 0 ? 0 : 2 * Math.abs(dy), w, h);
    camera.updateProjectionMatrix();
    const band = Math.max(h * 0.3, h - insetTop - insetBottom);
    halfH = Math.atan(tanV * aspect);
    halfV = Math.atan((tanV * band) / h);
    sunSprite.scale.setScalar((SUN_SCALE * vfov) / (50 * DEG));
  }

  // Mobile browsers resize the page when the address bar slides or the phone turns, and the
  // resize event can fire before layout settles. A stale drawing buffer then gets stretched to
  // the new shape, so check the laid-out size every frame instead of trusting the event.
  function ensureSize(): boolean {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (w === sizedW && h === sizedH) return false;
    resize();
    return true;
  }

  function setInsets(top: number, bottom: number): void {
    if (top === insetTop && bottom === insetBottom) return;
    insetTop = top;
    insetBottom = bottom;
    resize();
  }

  function fitDistance(radius: number): number {
    return (radius * 0.9) / Math.sin(Math.min(halfH, halfV));
  }

  let quality: 'auto' | 'low' | 'high' = 'auto';
  const screenRatio = () => Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  function setQuality(q: 'auto' | 'low' | 'high'): void {
    quality = q;
    const next = q === 'low' ? MIN_PIXEL_RATIO : screenRatio();
    if (next !== pixelRatio) {
      pixelRatio = next;
      renderer.setPixelRatio(pixelRatio);
      resize();
    }
  }

  let slowTime = 0;
  let fastTime = 0;
  function adapt(dt: number): void {
    if (quality !== 'auto') return;
    if (dt > 0.25) return; // Ignore tab switches.
    if (dt > 1 / 40) {
      slowTime += dt;
      fastTime = 0;
    } else {
      fastTime += dt;
      slowTime = Math.max(0, slowTime - dt * 0.5);
    }
    if (slowTime > 2 && pixelRatio > MIN_PIXEL_RATIO) {
      pixelRatio = Math.max(MIN_PIXEL_RATIO, pixelRatio - 0.25);
      renderer.setPixelRatio(pixelRatio);
      resize();
      slowTime = 0;
    } else if (fastTime > 10 && pixelRatio < screenRatio()) {
      pixelRatio = Math.min(pixelRatio + 0.25, MAX_PIXEL_RATIO);
      renderer.setPixelRatio(pixelRatio);
      resize();
      fastTime = 0;
    }
  }

  function update(orbit: OrbitSnapshot, phase: number, sunlight: number): void {
    const [sx, sy, sz] = orbit.sunDirection;
    // Recompute the direction from the interpolated phase so the light moves smoothly between ticks.
    const cb = Math.hypot(sx, sy);
    sunDir.set(-Math.sin(phase) * cb, Math.cos(phase) * cb, sz).normalize();
    sunLight.position.copy(sunDir).multiplyScalar(100);
    sunLight.intensity = 2.8 * sunlight;
    // Fill light is strongest in eclipse, so the station still reads on a phone at normal brightness.
    // In sunlight the sun carries the scene and the fill drops back to keep the shading.
    hemi.intensity = 2 - 1.35 * sunlight + 0.2 * sunlight * Math.max(0, sunDir.y);
    sunSprite.position.copy(sunDir).multiplyScalar(3600);
    earth.setSun(sunDir);
    // Inertial things (Earth's surface, stars) turn once per orbit in the station's frame.
    earth.pivot.rotation.z = phase;
    stars.rotation.z = phase;
  }

  function capture(): string {
    renderer.render(scene, camera);
    return canvas.toDataURL('image/png');
  }

  function thumbnail(width: number): string {
    renderer.render(scene, camera);
    const height = Math.round(width * 0.75);
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const g = c.getContext('2d');
    if (!g) throw new Error('no 2D canvas');
    // The largest 4:3 rectangle in the middle of the frame.
    const sw = Math.min(canvas.width, (canvas.height * 4) / 3);
    const sh = (sw * 3) / 4;
    g.drawImage(canvas, (canvas.width - sw) / 2, (canvas.height - sh) / 2, sw, sh, 0, 0, width, height);
    return c.toDataURL('image/jpeg', 0.72);
  }

  resize();
  return {
    renderer,
    scene,
    camera,
    earth,
    sunDir,
    update,
    render: () => renderer.render(scene, camera),
    resize,
    ensureSize,
    setInsets,
    fitDistance,
    adapt,
    setQuality,
    capture,
    thumbnail,
  };
}
