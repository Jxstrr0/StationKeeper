// Procedural surface detail for the grey-box modules: canvas textures (panel seams, quilted blankets,
// crinkled foil), and small parts every module shares (open trusses, handrails, docking rings).
// No image files: everything is drawn at startup, once, and shared.
import * as THREE from 'three';

/** A tiny deterministic generator so the art looks the same on every load. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  return c;
}

function texture(c: HTMLCanvasElement, color: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** How many metres one repeat of each tiling texture covers. */
export const TILE_M = 6;

/** Hull plating: four panels across, two down, with seams, fastener rows and a few faded panels. */
function hullCanvases(): { map: HTMLCanvasElement; bump: HTMLCanvasElement } {
  const S = 256;
  const rnd = lcg(7);
  const shades: number[] = [];
  for (let i = 0; i < 8; i++) shades.push(rnd());
  const map = canvas(S, S, (g) => {
    g.fillStyle = '#e2ded4';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 8; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const t = shades[i]!;
      g.fillStyle = t > 0.5 ? `rgba(255,252,240,${(t - 0.5) * 0.25})` : `rgba(90,85,75,${(0.5 - t) * 0.16})`;
      g.fillRect(col * 64, row * 128, 64, 128);
    }
    g.fillStyle = 'rgba(80,76,68,0.55)';
    for (let x = 0; x <= S; x += 64) g.fillRect(x - 1, 0, 2, S);
    for (let y = 0; y <= S; y += 128) g.fillRect(0, y - 1, S, 2);
    g.fillStyle = 'rgba(80,76,68,0.4)';
    for (let x = 0; x < S; x += 64) for (let y = 6; y < S; y += 10) g.fillRect(x + 4, y, 1.5, 1.5);
    // A hatch outline and a placard on one panel, so the plating doesn't read as wallpaper.
    g.strokeStyle = 'rgba(80,76,68,0.5)';
    g.lineWidth = 1.5;
    g.strokeRect(140, 150, 40, 56);
    g.fillStyle = 'rgba(123,63,196,0.55)';
    g.fillRect(22, 40, 20, 6);
  });
  const bump = canvas(S, S, (g) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#404040';
    for (let x = 0; x <= S; x += 64) g.fillRect(x - 1, 0, 2, S);
    for (let y = 0; y <= S; y += 128) g.fillRect(0, y - 1, S, 2);
    g.strokeStyle = '#505050';
    g.lineWidth = 1.5;
    g.strokeRect(140, 150, 40, 56);
    g.fillStyle = '#a0a0a0';
    for (let x = 0; x < S; x += 64) for (let y = 6; y < S; y += 10) g.fillRect(x + 4, y, 1.5, 1.5);
  });
  return { map, bump };
}

/** The stitched outer blanket of an inflatable hull: soft cells in a diamond quilt. */
function quiltCanvases(): { map: HTMLCanvasElement; bump: HTMLCanvasElement } {
  const S = 256;
  const step = 32;
  const lines = (g: CanvasRenderingContext2D, style: string, width: number) => {
    g.strokeStyle = style;
    g.lineWidth = width;
    g.beginPath();
    for (let k = -S; k <= S * 2; k += step) {
      g.moveTo(k, 0);
      g.lineTo(k + S, S);
      g.moveTo(k, S);
      g.lineTo(k + S, 0);
    }
    g.stroke();
  };
  const map = canvas(S, S, (g) => {
    g.fillStyle = '#e8e3d6';
    g.fillRect(0, 0, S, S);
    lines(g, 'rgba(120,112,98,0.35)', 1.2);
    // Load straps every quarter, the dark webbing that holds an inflatable's shape.
    g.fillStyle = 'rgba(150,140,120,0.5)';
    for (let x = 0; x < S; x += 64) g.fillRect(x, 0, 3, S);
  });
  const bump = canvas(S, S, (g) => {
    g.fillStyle = '#888888';
    g.fillRect(0, 0, S, S);
    lines(g, '#555555', 2.5);
    g.fillStyle = '#606060';
    for (let x = 0; x < S; x += 64) g.fillRect(x, 0, 3, S);
  });
  return { map, bump };
}

/** Crinkled gold insulation: irregular facets of lighter and darker foil. */
function foilCanvases(): { map: HTMLCanvasElement; bump: HTMLCanvasElement } {
  const S = 128;
  const rnd = lcg(31);
  const facets: { x: number; y: number; w: number; h: number; a: number; t: number }[] = [];
  for (let i = 0; i < 140; i++) facets.push({ x: rnd() * S, y: rnd() * S, w: 6 + rnd() * 22, h: 3 + rnd() * 10, a: rnd() * Math.PI, t: rnd() });
  const draw = (g: CanvasRenderingContext2D, colour: (t: number) => string, base: string) => {
    g.fillStyle = base;
    g.fillRect(0, 0, S, S);
    for (const f of facets) {
      g.save();
      g.translate(f.x, f.y);
      g.rotate(f.a);
      g.fillStyle = colour(f.t);
      g.fillRect(-f.w / 2, -f.h / 2, f.w, f.h);
      g.restore();
    }
  };
  const map = canvas(S, S, (g) => draw(g, (t) => (t > 0.5 ? `rgba(255,230,160,${(t - 0.5) * 0.7})` : `rgba(90,60,20,${(0.5 - t) * 0.6})`), '#b6955e'));
  const bump = canvas(S, S, (g) => draw(g, (t) => `rgb(${Math.round(60 + t * 140)},${Math.round(60 + t * 140)},${Math.round(60 + t * 140)})`, '#808080'));
  return { map, bump };
}

interface Surface {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
}
let surfaces: { hull: Surface; quilt: Surface; foil: Surface } | null = null;
function getSurfaces(): { hull: Surface; quilt: Surface; foil: Surface } {
  if (surfaces) return surfaces;
  const make = (c: { map: HTMLCanvasElement; bump: HTMLCanvasElement }): Surface => ({ map: texture(c.map, true), bump: texture(c.bump, false) });
  surfaces = { hull: make(hullCanvases()), quilt: make(quiltCanvases()), foil: make(foilCanvases()) };
  return surfaces;
}

/** Plated hull, quilted blanket and crinkled foil materials. Shared; only tiled geometry should use them. */
export function surfaceMaterials(): { plated: THREE.MeshStandardMaterial; quilted: THREE.MeshStandardMaterial; foil: THREE.MeshStandardMaterial } {
  const s = getSurfaces();
  return {
    plated: new THREE.MeshStandardMaterial({ color: 0xffffff, map: s.hull.map, bumpMap: s.hull.bump, bumpScale: 1.2, roughness: 0.55, metalness: 0.08 }),
    quilted: new THREE.MeshStandardMaterial({ color: 0xffffff, map: s.quilt.map, bumpMap: s.quilt.bump, bumpScale: 2, roughness: 0.75, metalness: 0 }),
    foil: new THREE.MeshStandardMaterial({ color: 0xffffff, map: s.foil.map, bumpMap: s.foil.bump, bumpScale: 1.5, roughness: 0.35, metalness: 0.45 }),
  };
}

/**
 * Scale a geometry's UVs so a tiling texture keeps the same size in metres whatever the part's size.
 * Cylinders and lathes run u around the circumference and v along the axis; `around` is rounded to a whole
 * number of repeats so the wrap seam lines up.
 */
export function tileUv(geo: THREE.BufferGeometry, aroundM: number, alongM: number): THREE.BufferGeometry {
  const uv = geo.getAttribute('uv');
  if (!uv) return geo;
  const su = Math.max(1, Math.round(aroundM / TILE_M));
  const sv = alongM / TILE_M;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const s1 = new THREE.Vector3(1, 1, 1);
const p = new THREE.Vector3();
const e = new THREE.Euler();

/**
 * An open square truss along +Z or -Z from the origin: four longerons, a frame every bay and one diagonal
 * per face per bay, alternating, so it reads as a lattice rather than a stack of plates.
 */
export function openTruss(length: number, sign: 1 | -1, width: number, rail: THREE.Material, brace: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const h = width / 2;
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.14, length), rail, 4);
  [
    [-h, -h],
    [h, -h],
    [-h, h],
    [h, h],
  ].forEach(([x, y], i) => rails.setMatrixAt(i, m4.makeTranslation(x!, y!, (sign * length) / 2)));
  g.add(rails);

  const bay = 1.2;
  const bays = Math.max(1, Math.floor(length / bay));
  const frames = new THREE.InstancedMesh(new THREE.BoxGeometry(width, 0.07, 0.07), brace, bays * 4);
  const diagLen = Math.hypot(bay, width);
  const diags = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.05, diagLen), brace, bays * 4);
  const tilt = Math.atan2(width, bay);
  let fi = 0;
  let di = 0;
  for (let b = 0; b < bays; b++) {
    const z0 = sign * (b * bay);
    const zc = sign * (b * bay + bay / 2);
    const flip = b % 2 === 0 ? 1 : -1;
    // Frame: four bars round the square at the start of the bay.
    for (const [x, y, rz] of [
      [0, h, 0],
      [0, -h, 0],
      [h, 0, Math.PI / 2],
      [-h, 0, Math.PI / 2],
    ] as const) {
      q.setFromEuler(e.set(0, 0, rz));
      frames.setMatrixAt(fi++, m4.compose(p.set(x, y, z0), q, s1));
    }
    // Diagonals: on the ±Y faces they lean in X; on the ±X faces they lean in Y.
    for (const y of [h, -h]) {
      q.setFromEuler(e.set(0, flip * tilt, 0));
      diags.setMatrixAt(di++, m4.compose(p.set(0, y, zc), q, s1));
    }
    for (const x of [h, -h]) {
      q.setFromEuler(e.set(flip * tilt, 0, 0));
      diags.setMatrixAt(di++, m4.compose(p.set(x, 0, zc), q, s1));
    }
  }
  g.add(frames, diags);
  return g;
}

/**
 * Handrails along a hull lying on the X axis: one rail at each angle round the hull (0 = +Y, towards +Z),
 * from x0 to x1, standing off the surface on posts.
 */
export function handrails(x0: number, x1: number, radius: number, angles: number[], mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const len = Math.abs(x1 - x0);
  if (len < 0.6 || angles.length === 0) return g;
  const xm = (x0 + x1) / 2;
  const posts = Math.max(2, Math.round(len / 0.9) + 1);
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(len, 0.05, 0.05), mat, angles.length);
  const stands = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 0.16, 0.04), mat, angles.length * posts);
  let k = 0;
  angles.forEach((a, i) => {
    q.setFromEuler(e.set(a, 0, 0));
    const dy = Math.cos(a);
    const dz = Math.sin(a);
    rails.setMatrixAt(i, m4.compose(p.set(xm, dy * (radius + 0.16), dz * (radius + 0.16)), q, s1));
    for (let j = 0; j < posts; j++) {
      const x = Math.min(x0, x1) + (j * len) / (posts - 1);
      stands.setMatrixAt(k++, m4.compose(p.set(x, dy * (radius + 0.08), dz * (radius + 0.08)), q, s1));
    }
  });
  g.add(rails, stands);
  return g;
}
