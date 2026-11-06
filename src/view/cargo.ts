// Cargo vehicles bringing modules on order. Over the last in-game hour of a delivery a small freighter comes in along
// the port's direction, slowing as it nears, and is gone the moment the module docks. One shared geometry and two
// shared materials for every vehicle; nothing is allocated per frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DeliverySnapshot } from '../sim/types';
import { approachOffset, approachPlan, approachProgress, type ApproachPlan } from './lifeMath';

/** Where a port is and which way it faces, in station space; written into the given vectors. False if it isn't there. */
export type PortLookup = (moduleId: string, portId: string, position: THREE.Vector3, direction: THREE.Vector3) => boolean;

interface Vehicle {
  object: THREE.Group;
  light: THREE.Mesh;
  plan: ApproachPlan | null;
  placed: boolean;
  seed: number;
}

/** The freighter, nose along +Z: a pressurised can, a service module, a docking probe and two small solar wings. */
function buildGeometry(): { body: THREE.BufferGeometry; wings: THREE.BufferGeometry } {
  const parts: THREE.BufferGeometry[] = [];
  const can = new THREE.CylinderGeometry(0.75, 0.75, 2.2, 14);
  can.rotateX(Math.PI / 2);
  can.translate(0, 0, 0.5);
  parts.push(can);
  const service = new THREE.CylinderGeometry(0.85, 0.85, 1.0, 14);
  service.rotateX(Math.PI / 2);
  service.translate(0, 0, -1.1);
  parts.push(service);
  const nose = new THREE.CylinderGeometry(0.3, 0.75, 0.5, 14);
  nose.rotateX(Math.PI / 2);
  nose.translate(0, 0, 1.85);
  parts.push(nose);
  const probe = new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6);
  probe.rotateX(Math.PI / 2);
  probe.translate(0, 0, 2.35);
  parts.push(probe);
  const bell = new THREE.CylinderGeometry(0.25, 0.4, 0.4, 10);
  bell.rotateX(Math.PI / 2);
  bell.translate(0, 0, -1.8);
  parts.push(bell);
  const strut = new THREE.BoxGeometry(5.2, 0.08, 0.08);
  strut.translate(0, 0, -1.1);
  parts.push(strut);
  for (const p of parts) for (const name of Object.keys(p.attributes)) if (name !== 'position' && name !== 'normal') p.deleteAttribute(name);
  const body = mergeGeometries(parts, false)!;
  const wingParts = [-1, 1].map((s) => {
    const w = new THREE.BoxGeometry(1.7, 0.04, 0.85);
    w.translate(s * 1.85, 0, -1.1);
    return w;
  });
  const wings = mergeGeometries(wingParts, false)!;
  return { body, wings };
}

const tmpPos = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpSide = new THREE.Vector3();
const tmpUp = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();
const tmpBox = new THREE.Box3();
const tmpCorner = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);

export class CargoTraffic {
  readonly root = new THREE.Group();
  private readonly vehicles = new Map<string, Vehicle>();
  private readonly spare: Vehicle[] = [];
  private geo: { body: THREE.BufferGeometry; wings: THREE.BufferGeometry } | null = null;
  private readonly bodyMat = new THREE.MeshStandardMaterial({ color: 0xd8d4ca, roughness: 0.6, metalness: 0.15, emissive: 0x1a1916 });
  private readonly wingMat = new THREE.MeshStandardMaterial({ color: 0x2a3a6e, roughness: 0.4, metalness: 0.2, emissive: 0x0c1226, side: THREE.DoubleSide });
  private readonly lightMat = new THREE.MeshBasicMaterial({ color: 0x9fe6a0, toneMapped: false });
  private readonly lightGeo = new THREE.SphereGeometry(0.14, 8, 6);
  private readonly seen = new Set<string>();
  private time = 0;

  constructor(
    private readonly lookup: PortLookup,
    /** How far the module on order reaches out of its port, metres, if its outline is drawn yet. */
    private readonly reach: (moduleId: string, position: THREE.Vector3, direction: THREE.Vector3) => number | null,
    private readonly floorY: number,
  ) {
    this.root.name = 'cargo';
  }

  update(deliveries: readonly DeliverySnapshot[], dt: number, reduceMotion: boolean): void {
    this.time += dt;
    this.seen.clear();
    for (const d of deliveries) {
      const t = approachProgress(d.hoursLeft);
      if (t === null || !this.lookup(d.to, d.port, tmpPos, tmpDir)) continue;
      this.seen.add(d.moduleId);
      let v = this.vehicles.get(d.moduleId);
      if (!v) {
        v = this.take();
        this.vehicles.set(d.moduleId, v);
      }
      // Wait for the outline so the vehicle knows where the module will sit; until then assume a short one.
      if (!v.plan) {
        const reach = this.reach(d.moduleId, tmpPos, tmpDir);
        const plan = approachPlan(tmpPos.y, tmpDir.y, reach ?? 6, this.floorY);
        if (reach !== null) v.plan = plan;
        this.target(plan, t);
      } else this.target(v.plan, t);
      const o = v.object;
      if (!v.placed) {
        o.position.copy(tmpTarget);
        v.placed = true;
      } else {
        // Ticks come in steps; ease towards where the vehicle should be so it glides between them.
        o.position.lerp(tmpTarget, 1 - Math.exp(-dt * 5));
      }
      o.lookAt(tmpPos);
      v.light.visible = reduceMotion || Math.sin(this.time * 5 + v.seed) > 0.3;
    }
    for (const [id, v] of this.vehicles) {
      if (this.seen.has(id)) continue;
      this.vehicles.delete(id);
      this.give(v);
    }
  }

  /** Writes the vehicle's point on the approach into tmpTarget. Uses tmpPos (port) and tmpDir (port direction). */
  private target(plan: ApproachPlan, t: number): void {
    const { along, side } = approachOffset(t, plan);
    tmpSide.crossVectors(tmpDir, Math.abs(tmpDir.y) > 0.9 ? X : UP).normalize();
    tmpUp.crossVectors(tmpSide, tmpDir).normalize();
    tmpTarget
      .copy(tmpPos)
      .addScaledVector(tmpDir, along)
      .addScaledVector(tmpSide, side)
      .addScaledVector(tmpUp, side * 0.35);
  }

  private take(): Vehicle {
    const v = this.spare.pop();
    if (v) {
      v.object.visible = true;
      v.plan = null;
      v.placed = false;
      return v;
    }
    this.geo ??= buildGeometry();
    const object = new THREE.Group();
    object.name = 'cargo-vehicle';
    object.add(new THREE.Mesh(this.geo.body, this.bodyMat));
    object.add(new THREE.Mesh(this.geo.wings, this.wingMat));
    const light = new THREE.Mesh(this.lightGeo, this.lightMat);
    light.position.set(0, 0.85, -1.1);
    object.add(light);
    object.traverse((o) => (o.raycast = () => {}));
    this.root.add(object);
    return { object, light, plan: null, placed: false, seed: Math.random() * 10 };
  }

  private give(v: Vehicle): void {
    v.object.visible = false;
    this.spare.push(v);
  }
}

/** How far `object` reaches out along `direction` from `position`, metres: the furthest of its box corners. */
export function reachAlong(object: THREE.Object3D, position: THREE.Vector3, direction: THREE.Vector3): number {
  tmpBox.setFromObject(object);
  if (tmpBox.isEmpty()) return 0;
  let best = 0;
  for (let i = 0; i < 8; i++) {
    tmpCorner.set(i & 1 ? tmpBox.max.x : tmpBox.min.x, i & 2 ? tmpBox.max.y : tmpBox.min.y, i & 4 ? tmpBox.max.z : tmpBox.min.z);
    best = Math.max(best, tmpCorner.sub(position).dot(direction));
  }
  return best;
}
