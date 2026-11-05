// Draws the station from sim snapshots: places modules at their ports, tints status lights,
// turns the solar wings toward the sun, and answers "which module did I tap?".
import * as THREE from 'three';
import type { ModuleDef, ModuleSnapshot, ModuleStatus, SimSnapshot } from '../sim/types';
import type { ModuleModel, ModuleModelSource } from './moduleModels';

const STATUS_COLORS: Record<ModuleStatus, number> = {
  powered: 0xb48ce8, // lilac: healthy
  shed: 0xd97757, // clay: warning
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

    if (m.attach) {
      const parent = this.entries.get(m.attach.to);
      const attach = m.attach;
      const pPort = parent?.def.ports.find((p) => p.id === attach.port);
      const cPort = def.ports.find((p) => p.id === attach.via);
      if (!parent || !pPort || !cPort) throw new Error(`Cannot place "${m.id}": missing parent or port`);
      // Parent port in station space.
      const pPos = new THREE.Vector3(...pPort.position).applyQuaternion(parent.object.quaternion).add(parent.object.position);
      const pDir = new THREE.Vector3(...pPort.direction).applyQuaternion(parent.object.quaternion);
      // Turn the child so its port faces back into the parent's port, then line the ports up.
      object.quaternion.setFromUnitVectors(new THREE.Vector3(...cPort.direction).normalize(), pDir.negate().normalize());
      const cOffset = new THREE.Vector3(...cPort.position).applyQuaternion(object.quaternion);
      object.position.copy(pPos).sub(cOffset);
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
    this.entries.set(m.id, { id: m.id, def, object, model, lightCore, halo, status: null });
    this.onModuleAdded?.();
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
        for (const g of e.model.glowMaterials) g.emissiveIntensity = m.status === 'powered' ? 1.6 : 0.02;
      }
      const visible = m.status !== 'shed' || blinkOn;
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
