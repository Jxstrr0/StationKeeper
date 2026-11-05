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
  /** Lower the resolution if frames are slow. Call once per frame with the frame time in seconds. */
  adapt(dt: number): void;
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
  const hemi = new THREE.HemisphereLight(0x2b2a3a, 0x3d5f8f, 0.5);
  scene.add(hemi);

  const sunDir = new THREE.Vector3(0, 1, 0);

  function resize(): void {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Narrow portrait screens get a wider vertical field of view so the station still fits.
    camera.fov = camera.aspect < 0.8 ? 62 : 50;
    camera.updateProjectionMatrix();
  }

  let slowTime = 0;
  let fastTime = 0;
  function adapt(dt: number): void {
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
    } else if (fastTime > 10 && pixelRatio < Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)) {
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
    hemi.intensity = 0.32 + 0.5 * sunlight * Math.max(0, sunDir.y);
    sunSprite.position.copy(sunDir).multiplyScalar(3600);
    earth.setSun(sunDir);
    // Inertial things (Earth's surface, stars) turn once per orbit in the station's frame.
    earth.pivot.rotation.z = phase;
    stars.rotation.z = phase;
  }

  resize();
  return { renderer, scene, camera, earth, sunDir, update, render: () => renderer.render(scene, camera), resize, adapt };
}
