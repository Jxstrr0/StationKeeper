// Draws the station from sim snapshots: places modules at their ports, tints status lights,
// turns the solar wings toward the sun, and answers "which module did I tap?".
import * as THREE from 'three';
import type { ModuleDef, ModuleSnapshot, ModuleStatus, SimSnapshot } from '../sim/types';
import { heatRgb } from './heatScale';
import type { ModuleModel, ModuleModelSource } from './moduleModels';

const STATUS_COLORS: Record<ModuleStatus, number> = {
  powered: 0xb48ce8, // lilac: healthy
  throttled: 0xe0b38a, // pale clay: running slow
  shed: 0xd97757, // clay: warning
  overheated: 0xff5a3c, // hot red-orange: tripped by heat
  off: 0x5a5852,
};

interface Entry {
  id: string;
  def: ModuleDef;
  object: THREE.Group;
  model: ModuleModel;
  lightCore: THREE.Mesh;
  halo: THREE.Sprite;
  status: ModuleStatus | null;
  /** Heat overlay: this module's tint material, and the materials it replaced. */
  heatMaterial: THREE.MeshStandardMaterial;
  swapped: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[];
}

function makeHaloTexture(): THREE.Texture {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

const CONTACT_SLOP = 0.2;

/** World-space boxes of every mesh under `root`, shrunk by the contact slop. */
function meshBoxes(root: THREE.Object3D, skip?: THREE.Object3D): THREE.Box3[] {
  const out: THREE.Box3[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o === skip) return;
    const box = new THREE.Box3().setFromObject(o);
    box.expandByScalar(-CONTACT_SLOP);
    if (!box.isEmpty()) out.push(box);
  });
  return out;
}

const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const tmpC = new THREE.Vector3();

export class StationView {
  readonly root = new THREE.Group();
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Set<string>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly haloTexture = makeHaloTexture();
  private readonly lightGeo = new THREE.SphereGeometry(0.16, 12, 8);
  private selection: THREE.BoxHelper | null = null;
  private selectedId: string | null = null;
  private blink = 0;
  private heatOverlay = false;
  /** Fires when a module finishes loading, so the caller can re-frame the camera. */
  onModuleAdded: (() => void) | null = null;

  constructor(
    private readonly defs: Map<string, ModuleDef>,
    private readonly models: ModuleModelSource,
  ) {
    this.root.name = 'station';
  }

  /** Load any modules in the snapshot we have not drawn yet. Parents are placed before children. */
  async sync(snap: SimSnapshot): Promise<void> {
    for (const m of snap.modules) {
      if (this.entries.has(m.id) || this.pending.has(m.id)) continue;
      this.pending.add(m.id);
      try {
        await this.add(m);
      } finally {
        this.pending.delete(m.id);
      }
    }
  }

  private async add(m: ModuleSnapshot): Promise<void> {
    const def = this.defs.get(m.defId);
    if (!def) throw new Error(`No definition for module "${m.defId}"`);
    const model = await this.models.load(def);
    const object = new THREE.Group();
    object.name = m.id;
    object.userData.moduleId = m.id;
    object.add(model.root);

    if (m.attach && !this.place(object, def, m.attach.to, m.attach.port, m.attach.via)) {
      throw new Error(`Cannot place "${m.id}": missing parent or port`);
    }

    const lightCore = new THREE.Mesh(this.lightGeo, new THREE.MeshBasicMaterial({ color: STATUS_COLORS.powered, toneMapped: false }));
    model.statusLight.add(lightCore);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.haloTexture,
        color: STATUS_COLORS.powered,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    halo.scale.setScalar(1.6);
    model.statusLight.add(halo);

    this.root.add(object);
    const heatMaterial = new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0, side: THREE.DoubleSide });
    const entry: Entry = { id: m.id, def, object, model, lightCore, halo, status: null, heatMaterial, swapped: [] };
    this.entries.set(m.id, entry);
    if (this.heatOverlay) this.applyHeat(entry, true);
    this.onModuleAdded?.();
  }

  /**
   * Put `object` (a module of type `def`) where its port `via` meets port `port` of module `to`.
   * Returns false if the parent or either port doesn't exist.
   */
  place(object: THREE.Object3D, def: ModuleDef, to: string, port: string, via: string): boolean {
    const parent = this.entries.get(to);
    const pPort = parent?.def.ports.find((p) => p.id === port);
    const cPort = def.ports.find((p) => p.id === via);
    if (!parent || !pPort || !cPort) return false;
    // Parent port in station space.
    const pPos = new THREE.Vector3(...pPort.position).applyQuaternion(parent.object.quaternion).add(parent.object.position);
    const pDir = new THREE.Vector3(...pPort.direction).applyQuaternion(parent.object.quaternion);
    // Turn the child so its port faces back into the parent's port, then line the ports up.
    object.quaternion.setFromUnitVectors(new THREE.Vector3(...cPort.direction).normalize(), pDir.negate().normalize());
    const cOffset = new THREE.Vector3(...cPort.position).applyQuaternion(object.quaternion);
    object.position.copy(pPos).sub(cOffset);
    return true;
  }

  /** Where a port is, and which way it faces, in station space. */
  portFrame(moduleId: string, portId: string): { position: THREE.Vector3; direction: THREE.Vector3 } | null {
    const e = this.entries.get(moduleId);
    const p = e?.def.ports.find((x) => x.id === portId);
    if (!e || !p) return null;
    return {
      position: new THREE.Vector3(...p.position).applyQuaternion(e.object.quaternion).add(e.object.position),
      direction: new THREE.Vector3(...p.direction).applyQuaternion(e.object.quaternion).normalize(),
    };
  }

  /**
   * Which existing module (if any) `candidate` would run into. Compares the world boxes of individual meshes,
   * shrunk a little so parts that merely touch at a docking port don't count.
   */
  collision(candidate: THREE.Object3D): string | null {
    candidate.updateWorldMatrix(true, true);
    const mine = meshBoxes(candidate);
    for (const e of this.entries.values()) {
      e.object.updateWorldMatrix(true, true);
      for (const theirs of meshBoxes(e.object, e.lightCore)) {
        for (const b of mine) if (b.intersectsBox(theirs)) return e.id;
      }
    }
    return null;
  }

  /** Display name of a module on the station. */
  moduleName(id: string): string {
    return this.entries.get(id)?.def.name ?? id;
  }

  /** Show or hide the Heat overlay: every module is tinted by its temperature. */
  setHeatOverlay(on: boolean): void {
    if (on === this.heatOverlay) return;
    this.heatOverlay = on;
    for (const e of this.entries.values()) this.applyHeat(e, on);
  }

  get heatOverlayOn(): boolean {
    return this.heatOverlay;
  }

  private applyHeat(e: Entry, on: boolean): void {
    if (on) {
      e.model.root.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || o === e.lightCore) return;
        e.swapped.push({ mesh: o, material: o.material });
        o.material = e.heatMaterial;
      });
    } else {
      for (const s of e.swapped) s.mesh.material = s.material;
      e.swapped = [];
    }
  }

  /** Centre and radius of the station, for framing the camera. */
  bounds(): { center: THREE.Vector3; radius: number } {
    const box = new THREE.Box3().setFromObject(this.root);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    return { center: sphere.center, radius: sphere.radius };
  }

  update(snap: SimSnapshot, sunDirWorld: THREE.Vector3, dt: number): void {
    this.blink += dt;
    const blinkOn = Math.sin(this.blink * 6) > -0.2;
    for (const m of snap.modules) {
      const e = this.entries.get(m.id);
      if (!e) continue;
      if (e.status !== m.status) {
        e.status = m.status;
        const color = STATUS_COLORS[m.status];
        (e.lightCore.material as THREE.MeshBasicMaterial).color.setHex(color);
        (e.halo.material as THREE.SpriteMaterial).color.setHex(color);
        const glow = m.status === 'powered' ? 1.6 : m.status === 'throttled' ? 0.8 : 0.02;
        for (const g of e.model.glowMaterials) g.emissiveIntensity = glow;
      }
      if (this.heatOverlay) {
        const [r, g, b] = heatRgb(m.tempC);
        e.heatMaterial.color.setRGB(r, g, b, THREE.SRGBColorSpace);
        // A little self-light so the tint still reads on the night side.
        e.heatMaterial.emissive.setRGB(r * 0.6, g * 0.6, b * 0.6, THREE.SRGBColorSpace);
      }
      const alarm = m.status === 'shed' || m.status === 'overheated';
      const visible = !alarm || blinkOn;
      e.lightCore.visible = visible;
      e.halo.visible = visible && m.status !== 'off';
      if (e.model.gimbal) this.trackSun(e, sunDirWorld);
    }
    if (this.selection && this.selectedId) {
      const e = this.entries.get(this.selectedId);
      if (e) this.selection.setFromObject(e.object);
    }
  }

  /** Rotate the wings about the gimbal axis so the panel normal points as close to the sun as it can. */
  private trackSun(e: Entry, sunDirWorld: THREE.Vector3): void {
    const gimbal = e.model.gimbal;
    if (!gimbal || !e.def.gimbalAxis || !e.def.panelNormal) return;
    // Sun direction in the module's own frame.
    e.object.getWorldQuaternion(tmpQ);
    tmpV.copy(sunDirWorld).applyQuaternion(tmpQ.invert());
    tmpA.set(...e.def.gimbalAxis).normalize();
    tmpN.set(...e.def.panelNormal).normalize();
    tmpV.addScaledVector(tmpA, -tmpV.dot(tmpA));
    if (tmpV.lengthSq() < 1e-6) return;
    tmpV.normalize();
    const angle = Math.atan2(tmpC.crossVectors(tmpN, tmpV).dot(tmpA), tmpN.dot(tmpV));
    gimbal.quaternion.setFromAxisAngle(tmpA, angle);
  }

  /** Which module (if any) is under the given normalised device coordinates. */
  pick(ndc: THREE.Vector2, camera: THREE.Camera): string | null {
    this.raycaster.setFromCamera(ndc, camera);
    const hits = this.raycaster.intersectObject(this.root, true);
    for (const h of hits) {
      if (h.object instanceof THREE.Sprite) continue;
      let o: THREE.Object3D | null = h.object;
      while (o && o.userData.moduleId === undefined) o = o.parent;
      if (o) return o.userData.moduleId as string;
    }
    return null;
  }

  select(id: string | null): void {
    this.selectedId = id;
    if (this.selection) {
      this.root.parent?.remove(this.selection);
      this.selection.dispose();
      this.selection = null;
    }
    const e = id ? this.entries.get(id) : undefined;
    if (!e) return;
    this.selection = new THREE.BoxHelper(e.object, 0xb48ce8);
    (this.selection.material as THREE.LineBasicMaterial).transparent = true;
    (this.selection.material as THREE.LineBasicMaterial).opacity = 0.7;
    this.root.parent?.add(this.selection);
  }
}
