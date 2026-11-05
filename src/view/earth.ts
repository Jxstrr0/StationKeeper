// Procedural Earth and atmosphere. One shader each, no textures to download.
import * as THREE from 'three';

const NOISE_GLSL = /* glsl */ `
  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y),
      mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y),
      u.z);
  }
  float fbm(vec3 p) {
    float a = 0.5;
    float s = 0.0;
    for (int k = 0; k < 5; k++) {
      s += a * vnoise(p);
      p = p * 2.07 + vec3(17.1, 3.7, 9.2);
      a *= 0.5;
    }
    return s;
  }
`;

const EARTH_VERT = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vLocal = normalize(position);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vPosW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const EARTH_FRAG = /* glsl */ `
  uniform vec3 uSunDir;
  uniform float uCloudShift;
  varying vec3 vLocal;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  ${NOISE_GLSL}
  void main() {
    vec3 p = vLocal;
    float h = fbm(p * 2.4 + 3.1);
    float land = smoothstep(0.515, 0.535, h);
    vec3 ocean = mix(vec3(0.012, 0.05, 0.12), vec3(0.03, 0.14, 0.26), smoothstep(0.35, 0.515, h));
    float tone = fbm(p * 11.0);
    vec3 ground = mix(vec3(0.13, 0.17, 0.08), vec3(0.42, 0.34, 0.22), smoothstep(0.35, 0.65, tone));
    ground = mix(ground, vec3(0.86, 0.88, 0.9), smoothstep(0.82, 0.9, abs(p.y)));
    vec3 col = mix(ocean, ground, land);

    float c = fbm(p * 6.0 + vec3(uCloudShift, 0.0, 0.0));
    float clouds = smoothstep(0.5, 0.72, c);
    col = mix(col, vec3(0.93, 0.94, 0.96), clouds * 0.9);

    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vPosW);
    float ndl = dot(n, uSunDir);
    float day = smoothstep(-0.06, 0.12, ndl);
    vec3 lit = col * (0.05 + 1.15 * max(ndl, 0.0));
    vec3 hv = normalize(uSunDir + v);
    lit += vec3(1.0, 0.95, 0.85) * pow(max(dot(n, hv), 0.0), 80.0) * (1.0 - land) * (1.0 - clouds) * 0.6;

    // Sparse city lights: fine speckle, gated by a coarse "where people live" mask.
    float towns = smoothstep(0.55, 0.7, vnoise(p * 35.0));
    float city = land * (1.0 - clouds) * towns * smoothstep(0.8, 0.9, vnoise(p * 700.0));
    vec3 night = col * 0.02 + vec3(1.0, 0.72, 0.38) * city * 0.3;

    vec3 outCol = mix(night, lit, day);
    // Terminator glow and limb haze.
    outCol += vec3(0.9, 0.4, 0.2) * 0.12 * (1.0 - abs(ndl * 6.0 - 0.3)) * step(abs(ndl), 0.2);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    outCol += vec3(0.28, 0.52, 1.0) * fres * (0.05 + 0.9 * day);
    gl_FragColor = vec4(outCol, 1.0);
  }
`;

const ATMO_FRAG = /* glsl */ `
  uniform vec3 uSunDir;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vPosW);
    float rim = 1.0 - abs(dot(n, v));
    float glow = pow(rim, 5.0);
    float day = smoothstep(-0.35, 0.25, dot(n, uSunDir));
    vec3 col = mix(vec3(0.35, 0.6, 1.0), vec3(0.95, 0.55, 0.3), (1.0 - day) * day * 2.5);
    gl_FragColor = vec4(col * glow * (0.04 + 1.2 * day), 1.0);
  }
`;

export interface Earth {
  /** Pivot at Earth's centre. Rotate about z to move the ground under the station. */
  pivot: THREE.Group;
  setSun(dir: THREE.Vector3): void;
  setCloudShift(shift: number): void;
}

export function createEarth(radius: number): Earth {
  const sun = { value: new THREE.Vector3(0, 1, 0) };
  const cloudShift = { value: 0 };
  const pivot = new THREE.Group();
  pivot.name = 'earth';

  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 128, 96),
    new THREE.ShaderMaterial({
      uniforms: { uSunDir: sun, uCloudShift: cloudShift },
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG,
    }),
  );
  pivot.add(surface);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.025, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: { uSunDir: sun },
      vertexShader: EARTH_VERT,
      fragmentShader: ATMO_FRAG,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  pivot.add(atmosphere);

  return {
    pivot,
    setSun: (dir) => sun.value.copy(dir),
    setCloudShift: (shift) => {
      cloudShift.value = shift;
    },
  };
}
