// The material library for the Blender-built module models.
//
// The .glb files carry geometry only: every primitive names one of these materials, and the loader swaps in the
// shared Three material of that name. Five of them carry tiling texture sets baked in Blender (albedo, tangent
// normal, roughness; see tools/blender/bake_textures.py); the models' UVs are already in metres per repeat, so
// the textures only need RepeatWrapping. All of them multiply in the ambient occlusion baked into vertex colours.
import * as THREE from 'three';

/** Materials that carry a baked texture set. Must match TILE in tools/blender/sk/geo.py. */
export const TEXTURED = ['hull', 'quilt', 'foil', 'panel', 'radiator'] as const;
type TexturedName = (typeof TEXTURED)[number];

/** Plain-colour materials. */
const PLAIN = ['white', 'slate', 'dark', 'stripe', 'rail'] as const;
type PlainName = (typeof PLAIN)[number];

export type StationMaterialName = TexturedName | PlainName | 'window';

export function isTextured(name: string): name is TexturedName {
  return (TEXTURED as readonly string[]).includes(name);
}

interface TextureSet {
  map: THREE.Texture | null;
  normalMap: THREE.Texture | null;
  roughnessMap: THREE.Texture | null;
}

export interface StationMaterials {
  /** Shared by every module. The wear pass clones these per module; nothing else should change them. */
  byName: Record<TexturedName | PlainName, THREE.MeshStandardMaterial>;
  /** Lit window glass. Clone it per module: the station dims and brightens each module's windows on its own. */
  window: THREE.MeshStandardMaterial;
  textures: Record<TexturedName, TextureSet>;
}

/** `flat` is the roughness used when the roughness map is off or missing. */
const LOOK: Record<TexturedName, { metalness: number; normal: number; flat: number; emissive?: number }> = {
  hull: { metalness: 0.08, normal: 1.0, flat: 0.55 },
  quilt: { metalness: 0, normal: 1.0, flat: 0.78 },
  foil: { metalness: 0.45, normal: 0.8, flat: 0.38 },
  // The cells glint; a little self-light keeps the blue from going black on the night side.
  panel: { metalness: 0.15, normal: 0.8, flat: 0.32, emissive: 0x0c1226 },
  // Edge-on to the Sun by design, so they only ever see earthshine; a touch of self-light keeps them reading as white.
  radiator: { metalness: 0.05, normal: 1.0, flat: 0.7, emissive: 0x57554e },
};

const PLAIN_LOOK: Record<PlainName, { color: number; roughness: number; metalness: number }> = {
  white: { color: 0xe6e3da, roughness: 0.5, metalness: 0.05 },
  slate: { color: 0x3a3936, roughness: 0.6, metalness: 0.15 },
  dark: { color: 0x1f1e1b, roughness: 0.8, metalness: 0.2 },
  stripe: { color: 0x7b3fc4, roughness: 0.45, metalness: 0.1 },
  // Handrails: the muted gold of anodised EVA rails.
  rail: { color: 0xc9a43a, roughness: 0.5, metalness: 0.35 },
};

async function loadTexture(loader: THREE.TextureLoader, file: string, srgb: boolean): Promise<THREE.Texture | null> {
  try {
    const t = await loader.loadAsync(`${import.meta.env.BASE_URL}textures/station/${file}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    // The models' UVs follow the glTF convention (v down the image), like any texture inside a .glb.
    t.flipY = false;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  } catch (err) {
    console.warn(`Could not load station texture ${file}.`, err);
    return null;
  }
}

let library: Promise<StationMaterials> | null = null;

/** The library, with its textures loaded. A texture that fails to load is simply left off. */
export function stationMaterials(): Promise<StationMaterials> {
  return (library ??= build());
}

async function build(): Promise<StationMaterials> {
  const loader = new THREE.TextureLoader();
  const sets = await Promise.all(
    TEXTURED.map(async (name): Promise<TextureSet> => {
      const [map, normalMap, roughnessMap] = await Promise.all([
        loadTexture(loader, `${name}_albedo.jpg`, true),
        loadTexture(loader, `${name}_normal.jpg`, false),
        loadTexture(loader, `${name}_rough.jpg`, false),
      ]);
      return { map, normalMap, roughnessMap };
    }),
  );
  const textures = {} as Record<TexturedName, TextureSet>;
  const byName = {} as Record<TexturedName | PlainName, THREE.MeshStandardMaterial>;
  TEXTURED.forEach((name, i) => {
    const set = sets[i]!;
    const look = LOOK[name];
    textures[name] = set;
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: look.metalness, vertexColors: true });
    m.name = name;
    m.map = set.map;
    m.normalMap = set.normalMap;
    m.roughnessMap = set.roughnessMap;
    // With flipY off the map's green axis runs against v, as for normal maps inside a .glb without tangents.
    m.normalScale.set(look.normal, -look.normal);
    if (!set.roughnessMap) m.roughness = look.flat;
    if (look.emissive !== undefined) m.emissive.setHex(look.emissive);
    byName[name] = m;
  });
  for (const name of PLAIN) {
    const m = new THREE.MeshStandardMaterial({ ...PLAIN_LOOK[name], vertexColors: true });
    m.name = name;
    byName[name] = m;
  }
  const window = new THREE.MeshStandardMaterial({ color: 0x2a2620, emissive: 0xffd9a0, emissiveIntensity: 1.6, roughness: 0.2 });
  window.name = 'window';
  return { byName, window, textures };
}

/**
 * Turn the fine surface detail (normal and roughness maps) on or off for every textured material under `root`,
 * including the per-module copies the wear pass makes. Low graphics goes without: albedo and baked occlusion carry
 * the look, and the fragment shader does less work per pixel.
 */
export function setSurfaceDetail(root: THREE.Object3D, lib: StationMaterials, on: boolean): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const m = o.material as THREE.Material;
    if (!(m instanceof THREE.MeshStandardMaterial) || !isTextured(m.name)) return;
    const set = lib.textures[m.name];
    const normalMap = on ? set.normalMap : null;
    const roughnessMap = on ? set.roughnessMap : null;
    if (m.normalMap === normalMap && m.roughnessMap === roughnessMap) return;
    m.normalMap = normalMap;
    m.roughnessMap = roughnessMap;
    m.roughness = roughnessMap ? 1 : LOOK[m.name].flat;
    m.needsUpdate = true;
  });
}
