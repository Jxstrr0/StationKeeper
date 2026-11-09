// Earth and its atmosphere.
//
// The ground is NASA's Blue Marble (day) and Black Marble (city lights), both public domain. Those maps are far
// too coarse for a camera this close, so the shader adds its own fine detail on top, and the weather is drawn
// entirely in the shader so it can drift. All the noise comes from one small 3D texture: a lookup per octave is
// much cheaper on a phone than hashing.
import * as THREE from 'three';
import { Rng } from '../sim/rng';

/** Degrees between the orbit and the equator. Steep enough that the ground track wanders over most of the map. */
const INCLINATION_DEG = 51.6;
const DAY_MINUTES = 1440;

const EARTH_VERT = /* glsl */ `
  varying vec3 vLocal;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying float vInside;
  varying vec3 vCentre;
  void main() {
    vLocal = normalize(position);
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vPosW = w.xyz;
    vCentre = modelMatrix[3].xyz;
    vInside = step(distance(cameraPosition, vCentre), length(position));
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const EARTH_FRAG = /* glsl */ `
  precision highp sampler3D;
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler3D uNoise;
  uniform vec3 uSunDir;
  uniform vec3 uSunLocal;
  uniform float uCloudTurn;
  uniform float uDetail;
  varying vec3 vLocal;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  vec3 turnY(vec3 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec3(c * p.x + s * p.z, p.y, c * p.z - s * p.x);
  }

  // Cloud cover at a point on the unit sphere: big weather systems, warped so they streak and curl, then
  // broken up at the edges by finer octaves. 'fine' is how many of the small octaves to pay for.
  float cloudCover(vec3 p, float fine) {
    vec3 q = turnY(p, uCloudTurn);
    vec3 warp = texture(uNoise, q * 0.16 + 0.31).rgb - 0.5;
    q += warp * 0.16;
    // Weather follows latitude: a band at the equator, clear deserts either side, storm tracks beyond.
    float lat = abs(p.y);
    float belt = 0.07 * cos(lat * 9.5) - 0.05 * smoothstep(0.1, 0.35, lat) * (1.0 - smoothstep(0.35, 0.6, lat));
    float n = texture(uNoise, q * 0.09).r * 0.22;
    n += texture(uNoise, q * 0.33 + 0.2).g * 0.3;
    n += texture(uNoise, q * 0.71 + 0.4).b * 0.2;
    n += texture(uNoise, q * 1.5 + 0.6).a * 0.12;
    float amp = 0.16;
    if (fine > 0.5) {
      n += texture(uNoise, q * 3.1 + 0.1).r * 0.07;
      n += texture(uNoise, q * 6.7 + 0.3).g * 0.045;
      n += texture(uNoise, q * 14.3 + 0.5).b * 0.028;
      n += texture(uNoise, q * 31.0 + 0.7).a * 0.017;
      amp = 0.0;
    }
    n += amp * 0.5;
    return smoothstep(0.53, 0.66, n + belt);
  }

  void main() {
    vec3 p = normalize(vLocal);
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vPosW);
    float ndl = dot(n, uSunDir);
    float ndv = max(dot(n, v), 0.0);

    vec3 base = texture2D(uDay, vUv).rgb;
    // The map shades the sea by depth; from orbit it is one deep blue, a little paler over the shelves.
    float sea = smoothstep(0.012, 0.05, base.b - max(base.r, base.g));
    float shelf = smoothstep(0.03, 0.2, base.g);
    vec3 water = mix(vec3(0.006, 0.028, 0.075), vec3(0.015, 0.09, 0.15), shelf);
    // Fine relief the map cannot carry: mottled ground, with the bright side of each bump facing the sun.
    float d1 = texture(uNoise, p * 5.3).r;
    float d2 = texture(uNoise, p * 12.7 + 0.37).g;
    float d3 = texture(uNoise, p * 29.0 + 0.11).b;
    float rough = (d1 * 0.5 + d2 * 0.3 + d3 * 0.2) - 0.5;
    vec3 ground = base * (1.0 + uDetail * 0.7 * rough);
    vec3 col = mix(ground, water * (1.0 + 0.25 * rough), sea);

    float clouds = cloudCover(p, uDetail);
    // The shadow a cloud casts falls a little down-sun of it.
    float shadow = cloudCover(normalize(p + uSunLocal * 0.012), 0.0);
    float lightOnGround = 1.0 - 0.45 * shadow * (1.0 - clouds);

    float day = smoothstep(-0.1, 0.18, ndl);
    float sunUp = max(ndl, 0.0);
    vec3 lit = col * (0.02 + 1.7 * sunUp) * lightOnGround;
    // Sun glint on open water: a tight core inside a broad sheen.
    vec3 hv = normalize(uSunDir + v);
    float ndh = max(dot(n, hv), 0.0);
    float glint = pow(ndh, 260.0) * 2.4 + pow(ndh, 28.0) * 0.16;
    lit += vec3(1.0, 0.93, 0.8) * glint * sea * (1.0 - clouds) * day;

    // Cloud tops: bright by day, warm towards the terminator, faintly moonlit at night. Thick cloud is whiter.
    float thick = smoothstep(0.1, 0.9, clouds);
    vec3 cloudDay = mix(vec3(0.78, 0.8, 0.84), vec3(1.0), thick) * (0.03 + 1.3 * pow(sunUp, 0.8));
    cloudDay *= mix(vec3(1.0, 0.62, 0.38), vec3(1.0), smoothstep(0.0, 0.28, ndl));
    lit = mix(lit, cloudDay, clouds * 0.94);

    // Night side: city lights, sharpened into points by fine noise, hidden under cloud.
    float glow = texture2D(uNight, vUv).r;
    float speck = smoothstep(0.5, 0.72, texture(uNoise, p * 147.0 + 0.5).g) * (0.5 + texture(uNoise, p * 61.0).r);
    vec3 cities = vec3(1.0, 0.74, 0.42) * glow * (0.5 + 5.5 * speck) * (1.0 - clouds * 0.92);
    vec3 night = col * 0.012 + vec3(0.01, 0.014, 0.024) * clouds + cities;

    vec3 outCol = mix(night, lit, day);

    // Air: a blue veil that thickens towards the limb, and a band of sunset where day gives out.
    float limb = pow(1.0 - ndv, 2.6);
    vec3 haze = vec3(0.22, 0.46, 1.0) * limb * (0.03 + 1.25 * smoothstep(-0.12, 0.3, ndl));
    float dusk = smoothstep(-0.16, 0.02, ndl) * (1.0 - smoothstep(0.02, 0.26, ndl));
    haze += vec3(1.0, 0.36, 0.12) * dusk * (0.05 + 0.5 * limb);
    outCol = outCol * (1.0 - 0.35 * limb * day) + haze;

    gl_FragColor = vec4(outCol, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const ATMO_FRAG = /* glsl */ `
  uniform vec3 uSunDir;
  uniform float uRadius;
  varying float vInside;
  varying vec3 vCentre;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vPosW);
    // How high above the ground this line of sight passes at its lowest. Air thins quickly with height, so the
    // glow is brightest against the horizon and gone a little way above it.
    vec3 toCentre = vCentre - cameraPosition;
    float pass = length(cross(toCentre, -v)) - uRadius;
    float glow = exp(-max(pass, 0.0) / (uRadius * 0.0034)) * 0.9 + exp(-max(pass, 0.0) / (uRadius * 0.011)) * 0.22;
    // A low camera can dip inside this shell, where none of that holds.
    glow *= 1.0 - vInside;
    float sun = dot(n, uSunDir);
    float day = smoothstep(-0.3, 0.2, sun);
    float dusk = smoothstep(-0.34, -0.06, sun) * (1.0 - smoothstep(-0.06, 0.3, sun));
    vec3 col = mix(vec3(0.3, 0.56, 1.0), vec3(1.0, 0.42, 0.16), dusk * 0.85);
    gl_FragColor = vec4(col * glow * (0.03 + 1.5 * day), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** A cube of random bytes that tiles in every direction. Sampled with filtering, it is smooth value noise. */
function makeNoiseTexture(size: number): THREE.Data3DTexture {
  const rng = new Rng(4217);
  const data = new Uint8Array(size * size * size * 4);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rng.next() * 256);
  const tex = new THREE.Data3DTexture(data, size, size, size);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** A one-pixel stand-in, so the shader has something to read until the real map arrives. */
function flatTexture(r: number, g: number, b: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export interface Earth {
  /** Pivot at Earth's centre. Rotate about z to move the ground under the station. */
  pivot: THREE.Group;
  setSun(dir: THREE.Vector3): void;
  /** Game minutes since the start: turns the planet under the orbit and drifts the weather. */
  setTime(minutes: number): void;
  /** Fetch the maps. `sharp` is asked once the small day map is up: true fetches the large one too. */
  load(baseUrl: string, sharp: () => boolean): void;
  /** Low graphics drops the finest octaves of ground and cloud detail. */
  setDetail(on: boolean): void;
}

export function createEarth(radius: number, maxAnisotropy = 1): Earth {
  const sun = { value: new THREE.Vector3(0, 1, 0) };
  const sunLocal = { value: new THREE.Vector3(0, 1, 0) };
  const cloudTurn = { value: 0 };
  const detail = { value: 1 };
  const day = { value: flatTexture(10, 30, 60) as THREE.Texture };
  const night = { value: flatTexture(0, 0, 0) as THREE.Texture };
  const pivot = new THREE.Group();
  pivot.name = 'earth';

  // The orbit lies in the pivot's XY plane. Lean the planet's axis off the orbit's so the track is inclined.
  const tilt = new THREE.Group();
  tilt.rotation.x = ((90 - INCLINATION_DEG) * Math.PI) / 180;
  pivot.add(tilt);

  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 128, 96),
    new THREE.ShaderMaterial({
      uniforms: { uSunDir: sun, uSunLocal: sunLocal, uCloudTurn: cloudTurn, uDetail: detail, uDay: day, uNight: night, uNoise: { value: makeNoiseTexture(32) } },
      vertexShader: EARTH_VERT,
      fragmentShader: EARTH_FRAG,
    }),
  );
  tilt.add(surface);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.05, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: { uSunDir: sun, uRadius: { value: radius } },
      vertexShader: EARTH_VERT,
      fragmentShader: ATMO_FRAG,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  pivot.add(atmosphere);

  const inv = new THREE.Matrix4();
  function setSun(dir: THREE.Vector3): void {
    sun.value.copy(dir);
    // The same direction in the surface's own frame, for the cloud shadows.
    surface.updateWorldMatrix(true, false);
    sunLocal.value.copy(dir).transformDirection(inv.copy(surface.matrixWorld).invert());
  }

  function setTime(minutes: number): void {
    surface.rotation.y = ((minutes % DAY_MINUTES) / DAY_MINUTES) * Math.PI * 2;
    // Weather drifts east a little faster than the ground turns: once round in about twelve days.
    cloudTurn.value = (minutes / (DAY_MINUTES * 12)) * Math.PI * 2;
  }

  function load(baseUrl: string, sharp: () => boolean): void {
    const loader = new THREE.TextureLoader();
    const prepare = (t: THREE.Texture, colour: boolean): THREE.Texture => {
      if (colour) t.colorSpace = THREE.SRGBColorSpace;
      else t.format = THREE.RedFormat; // one channel is all the lights need, and a quarter of the memory
      t.wrapS = THREE.RepeatWrapping;
      t.anisotropy = Math.min(8, maxAnisotropy);
      return t;
    };
    const swap = (slot: { value: THREE.Texture }, t: THREE.Texture): void => {
      slot.value.dispose();
      slot.value = t;
    };
    const dir = `${baseUrl}textures/space/`;
    // A missing map is not worth an error: the planet stays a plain blue and the game goes on.
    const ignore = (): void => undefined;
    loader.load(
      `${dir}earth-day-2k.jpg`,
      (t) => {
        swap(day, prepare(t, true));
        if (sharp()) loader.load(`${dir}earth-day-4k.jpg`, (big) => swap(day, prepare(big, true)), undefined, ignore);
      },
      undefined,
      ignore,
    );
    loader.load(
      `${dir}earth-night-2k.jpg`,
      (t) => {
        swap(night, prepare(t, false));
        if (sharp()) loader.load(`${dir}earth-night-4k.jpg`, (big) => swap(night, prepare(big, false)), undefined, ignore);
      },
      undefined,
      ignore,
    );
  }

  return {
    pivot,
    setSun,
    setTime,
    load,
    setDetail: (on) => {
      detail.value = on ? 1 : 0;
    },
  };
}
