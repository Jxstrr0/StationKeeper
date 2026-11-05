// Build mode in 3D: glowing markers on ports where the chosen module fits, and a see-through "ghost"
// of the module at the port being previewed. The sim decides the port rules; this adds the collision check.
import * as THREE from 'three';
import type { ModuleDef } from '../sim/types';
import type { ModuleModelSource } from './moduleModels';
import type { StationView } from './stationView';

export interface PortRef {
  moduleId: string;
  portId: string;
}

const GHOST_OK = 0xb48ce8;
const GHOST_BLOCKED = 0xd97757;
const MARKER_RADIUS = 0.55;
/** Invisible hit sphere around each marker, sized for a fingertip. */
const MARKER_HIT_RADIUS = 1.6;

export class BuildView {
  readonly root = new THREE.Group();
  private readonly markers: { ref: PortRef; group: THREE.Group; hit: THREE.Mesh }[] = [];
  private readonly markerGeo = new THREE.SphereGeometry(MARKER_RADIUS, 16, 12);
  private readonly ringGeo = new THREE.TorusGeometry(0.95, 0.07, 8, 32);
  private readonly hitGeo = new THREE.SphereGeometry(MARKER_HIT_RADIUS, 8, 6);
  private readonly markerMat = new THREE.MeshBasicMaterial({ color: GHOST_OK, transparent: true, opacity: 0.9, toneMapped: false });
  private readonly ringMat = new THREE.MeshBasicMaterial({ color: GHOST_OK, transparent: true, opacity: 0.6, toneMapped: false });
  private readonly hitMat = new THREE.MeshBasicMaterial({ visible: false });
  private readonly ghostMat = new THREE.MeshBasicMaterial({ color: GHOST_OK, transparent: true, opacity: 0.38, depthWrite: false });
  private readonly raycaster = new THREE.Raycaster();
  private ghost: THREE.Object3D | null = null;
  private time = 0;
  private selected: PortRef | null = null;
  /** Bumped on every change, so a slow model load can tell it has been superseded. */
  private generation = 0;

  constructor(
    private readonly station: StationView,
    private readonly models: ModuleModelSource,
  ) {
    this.root.name = 'build';
  }

  /**
   * Of the given free ports, find the ones where `def` (mounted by `via`) fits without hitting anything,
   * and put a marker on each. Returns those ports.
   */
  async showPorts(def: ModuleDef, via: string, candidates: readonly PortRef[]): Promise<PortRef[]> {
    const gen = ++this.generation;
    this.clearMarkers();
    this.clearGhost();
    const probe = (await this.models.load(def)).root;
    if (gen !== this.generation) return [];
    const fits: PortRef[] = [];
    for (const ref of candidates) {
      if (!this.station.place(probe, def, ref.moduleId, ref.portId, via)) continue;
      if (this.station.collision(probe)) continue;
      fits.push(ref);
      this.addMarker(ref);
    }
    return fits;
  }

  private addMarker(ref: PortRef): void {
    const frame = this.station.portFrame(ref.moduleId, ref.portId);
    if (!frame) return;
    const group = new THREE.Group();
    group.position.copy(frame.position).addScaledVector(frame.direction, 0.9);
    const ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), frame.direction);
    const hit = new THREE.Mesh(this.hitGeo, this.hitMat);
    group.add(new THREE.Mesh(this.markerGeo, this.markerMat), ring, hit);
    this.root.add(group);
    this.markers.push({ ref, group, hit });
  }

  /** The port marker under the given normalised device coordinates, if any. */
  pickPort(ndc: THREE.Vector2, camera: THREE.Camera): PortRef | null {
    this.raycaster.setFromCamera(ndc, camera);
    const hits = this.raycaster.intersectObjects(
      this.markers.map((m) => m.hit),
      false,
    );
    const first = hits[0];
    return first ? (this.markers.find((m) => m.hit === first.object)?.ref ?? null) : null;
  }

  /** Show a ghost of `def` at `ref`. Resolves to the id of the module it would hit, or null if it fits. */
  async showGhost(def: ModuleDef, via: string, ref: PortRef): Promise<string | null> {
    const gen = ++this.generation;
    this.clearGhost();
    const ghost = (await this.models.load(def)).root;
    if (gen !== this.generation) return null;
    if (!this.station.place(ghost, def, ref.moduleId, ref.portId, via)) return null;
    const blocker = this.station.collision(ghost);
    this.ghostMat.color.setHex(blocker ? GHOST_BLOCKED : GHOST_OK);
    ghost.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = this.ghostMat;
    });
    this.ghost = ghost;
    this.selected = ref;
    this.root.add(ghost);
    return blocker;
  }

  /** Pulse the markers, and grow them with camera distance so they stay easy to see and tap. */
  update(dt: number, camera: THREE.Camera): void {
    this.time += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
    this.ringMat.opacity = 0.35 + 0.45 * pulse;
    for (const m of this.markers) {
      const chosen = this.selected && m.ref.moduleId === this.selected.moduleId && m.ref.portId === this.selected.portId;
      const reach = Math.max(1, camera.position.distanceTo(m.group.position) / 40);
      m.group.scale.setScalar(reach * (chosen ? 1.25 : 0.9 + 0.15 * pulse));
    }
    if (this.ghost) this.ghostMat.opacity = 0.28 + 0.14 * pulse;
  }

  clearGhost(): void {
    if (this.ghost) this.root.remove(this.ghost);
    this.ghost = null;
    this.selected = null;
  }

  private clearMarkers(): void {
    for (const m of this.markers) this.root.remove(m.group);
    this.markers.length = 0;
  }

  /** Leave build mode in the view: no markers, no ghost. */
  clear(): void {
    this.generation++;
    this.clearMarkers();
    this.clearGhost();
  }
}
