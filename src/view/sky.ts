// Everything beyond Earth: stars, the Milky Way and the Moon.
//
// The stars are points with their own sizes and colours, counted out the way real ones are (a few bright, a great
// many faint). The Milky Way is NASA's all-sky map (public domain), used only for its soft glow; extra faint
// stars are then scattered where that map is bright, so the band is grainy up close rather than a smear.
import * as THREE from 'three';
import { Rng } from '../sim/rng';

const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uScale;
  varying vec3 vColor;
  void main() {
    // A point can't be drawn smaller than a pixel, so the faintest ones stay a pixel and dim instead.
    float px = aSize * uScale;
    vColor = aColor * min(1.0, px * px);
    gl_PointSize = max(px, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const STAR_FRAG = /* glsl */ `
  uniform float uBright;
  varying vec3 vColor;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float fall = clamp(1.0 - dot(d, d) * 4.0, 0.0, 1.0);
    gl_FragColor = vec4(vColor * uBright * fall * fall, 1.0);
    #include <colorspace_fragment>
  }
`;

const GLOW_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLOW_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uBright;
  varying vec2 vUv;
  void main() {
    // The map's own sky is a dark grey; take that off so empty space stays black.
    vec3 c = texture2D(uMap, vUv).rgb;
    c *= smoothstep(0.055, 0.2, dot(c, vec3(0.3, 0.5, 0.2)));
    // Cooler than the map: its dust lanes are a strong brown, and the eye sees this glow as near white.
    c = mix(c, vec3(dot(c, vec3(0.3, 0.5, 0.2))) * vec3(0.92, 0.96, 1.08), 0.6);
    gl_FragColor = vec4(c * uBright, 1.0);
    #include <colorspace_fragment>
  }
`;

const MOON_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const MOON_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uSunDir;
  varying vec2 vUv;
  varying vec3 vNormalW;
  void main() {
    // Dusty ground scatters light back the way it came, so the lit face is flat and bright right to the edge.
    float lit = smoothstep(-0.02, 0.12, dot(normalize(vNormalW), uSunDir));
    vec3 c = texture2D(uMap, vUv).rgb * (0.012 + 1.25 * lit);
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Star colours from hot to cool. Most stars you can see are white or bluish; the cool ones are the minority. */
const TINTS: readonly (readonly [number, number, number])[] = [
  [0.72, 0.82, 1.0],
  [0.86, 0.91, 1.0],
  [1.0, 1.0, 1.0],
  [1.0, 0.96, 0.86],
  [1.0, 0.86, 0.68],
  [1.0, 0.72, 0.5],
];

/** The point on a sphere of `radius` that Three's sphere geometry maps the texture coordinate (u, v) to. */
function onSphere(u: number, v: number, radius: number, out: Float32Array, at: number): void {
  const phi = u * Math.PI * 2;
  const theta = (1 - v) * Math.PI;
  out[at] = -radius * Math.cos(phi) * Math.sin(theta);
  out[at + 1] = radius * Math.cos(theta);
  out[at + 2] = radius * Math.sin(phi) * Math.sin(theta);
}

interface StarSpec {
  count: number;
  /** Magnitude of the faintest star. Each magnitude brighter is about a third as common. */
  faintest: number;
  brightest: number;
}

function starPoints(rng: Rng, radius: number, spec: StarSpec, place: (out: Float32Array, at: number) => void, uniforms: Record<string, THREE.IUniform>): THREE.Points {
  const positions = new Float32Array(spec.count * 3);
  const colors = new Float32Array(spec.count * 3);
  const sizes = new Float32Array(spec.count);
  for (let i = 0; i < spec.count; i++) {
    place(positions, i * 3);
    const mag = Math.max(spec.brightest, spec.faintest + Math.log10(Math.max(1e-6, rng.next())) / 0.48);
    // Brightness falls 2.5 times a magnitude; size carries part of it and the colour the rest.
    const flux = Math.pow(10, -0.4 * (mag - 3.5));
    const size = THREE.MathUtils.clamp(0.95 + 0.45 * (6 - mag), 0.85, 3.6);
    const level = THREE.MathUtils.clamp(0.32 + flux * 0.9, 0.3, 1.6);
    const tint = TINTS[Math.min(TINTS.length - 1, Math.floor(rng.next() ** 1.4 * TINTS.length))]!;
    colors.set([tint[0] * level, tint[1] * level, tint[2] * level], i * 3);
    sizes[i] = size;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  return new THREE.Points(geo, mat);
}

export interface Sky {
  /** Turn this once per orbit, with Earth: the stars are fixed and the station is what goes round. */
  group: THREE.Group;
  /** Device pixels per CSS pixel, so stars keep their size on sharp screens. */
  setPixelRatio(ratio: number): void;
  /** 1 in eclipse, lower in sunlight: eyes and cameras lose the faint stars when the sun is in frame. */
  setDark(dark: number): void;
  setSun(dir: THREE.Vector3): void;
  load(baseUrl: string): void;
}

export function createSky(radius: number): Sky {
  const rng = new Rng(9001);
  const scale = { value: 1 };
  const starBright = { value: 1 };
  const glowBright = { value: 0.3 };
  const sun = { value: new THREE.Vector3(0, 1, 0) };
  const group = new THREE.Group();
  group.name = 'sky';

  // The field: uniform over the sphere.
  const field = starPoints(
    rng,
    radius,
    { count: 26000, faintest: 8.2, brightest: -0.8 },
    (out, at) => {
      const z = rng.range(-1, 1);
      const t = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(1 - z * z);
      out[at] = radius * r * Math.cos(t);
      out[at + 1] = radius * r * Math.sin(t);
      out[at + 2] = radius * z;
    },
    { uScale: scale, uBright: starBright },
  );
  field.renderOrder = -3;
  group.add(field);

  // The Milky Way's glow and its own stars share one tilted frame, so they line up whatever the tilt.
  const galaxy = new THREE.Group();
  galaxy.rotation.set(0.9, 0.4, 0.3);
  group.add(galaxy);

  // The Moon, a little larger than life so it reads on a phone, about a quarter of the sky round from the sun.
  const moonMap = { value: null as THREE.Texture | null };
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.0125, 32, 20),
    new THREE.ShaderMaterial({ uniforms: { uMap: moonMap, uSunDir: sun }, vertexShader: MOON_VERT, fragmentShader: MOON_FRAG }),
  );
  moon.position.set(Math.sin(1.9), Math.cos(1.9), 0.16).normalize().multiplyScalar(radius * 0.92);
  moon.rotation.set(0.3, 2.2, 0.1);
  moon.visible = false;
  moon.renderOrder = -1;
  group.add(moon);

  function load(baseUrl: string): void {
    const loader = new THREE.TextureLoader();
    const dir = `${baseUrl}textures/space/`;
    const ignore = (): void => undefined;
    loader.load(
      `${dir}moon-512.jpg`,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        moonMap.value = t;
        moon.visible = true;
      },
      undefined,
      ignore,
    );
    loader.load(
      `${dir}milky-way-1k.jpg`,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        const glow = new THREE.Mesh(
          new THREE.SphereGeometry(radius * 1.02, 48, 24),
          new THREE.ShaderMaterial({
            uniforms: { uMap: { value: t }, uBright: glowBright },
            vertexShader: GLOW_VERT,
            fragmentShader: GLOW_FRAG,
            side: THREE.BackSide,
            depthWrite: false,
          }),
        );
        glow.renderOrder = -4;
        galaxy.add(glow);
        const band = bandStars(t.image as CanvasImageSource, rng, radius, { uScale: scale, uBright: starBright });
        if (band) {
          band.renderOrder = -3;
          galaxy.add(band);
        }
      },
      undefined,
      ignore,
    );
  }

  return {
    group,
    setPixelRatio: (ratio) => {
      scale.value = ratio;
    },
    setDark: (dark) => {
      starBright.value = 0.62 + 0.38 * dark;
      glowBright.value = 0.1 + 0.2 * dark;
    },
    setSun: (dir) => sun.value.copy(dir),
    load,
  };
}

/** Faint stars scattered where the Milky Way map is bright. */
function bandStars(image: CanvasImageSource, rng: Rng, radius: number, uniforms: Record<string, THREE.IUniform>): THREE.Points | null {
  const w = 256;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(image, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  // Running total of brightness, weighted by how much sky each row of the map really covers.
  const cdf = new Float32Array(w * h);
  let total = 0;
  for (let y = 0; y < h; y++) {
    const area = Math.sin(((y + 0.5) / h) * Math.PI);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = Math.max(0, (px[i]! + px[i + 1]! + px[i + 2]!) / 765 - 0.1);
      total += lum * lum * area;
      cdf[y * w + x] = total;
    }
  }
  if (total <= 0) return null;
  return starPoints(
    rng,
    radius,
    { count: 22000, faintest: 8.6, brightest: 3 },
    (out, at) => {
      const target = rng.next() * total;
      let lo = 0;
      let hi = cdf.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cdf[mid]! < target) lo = mid + 1;
        else hi = mid;
      }
      const u = ((lo % w) + rng.next()) / w;
      const v = 1 - (Math.floor(lo / w) + rng.next()) / h;
      onSphere(u, v, radius, out, at);
    },
    uniforms,
  );
}
