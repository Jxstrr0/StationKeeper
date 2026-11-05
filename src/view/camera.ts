// Touch-first orbit camera: one finger drags to orbit, two fingers pinch to zoom, a quick tap selects.
// Mouse works too: drag to orbit, wheel to zoom, click to select.
import * as THREE from 'three';

export interface OrbitCameraOptions {
  minDistance: number;
  maxDistance: number;
  /** Keep the camera at least this far above the plane y = floorY (so it never dives into Earth). */
  floorY: number;
}

const TAP_MAX_MOVE_PX = 10;
const TAP_MAX_MS = 350;
const ROTATE_SPEED = 0.0065; // radians per pixel
const DAMPING = 6; // per second, for drag inertia

export class OrbitCamera {
  readonly target = new THREE.Vector3();
  azimuth = -0.9;
  polar = 1.2;
  distance = 60;
  /** Called with client coordinates when the user taps without dragging. */
  onTap: ((x: number, y: number) => void) | null = null;

  private readonly pointers = new Map<number, { x: number; y: number }>();
  private velAz = 0;
  private velPolar = 0;
  private lastMoveMs = 0;
  private pinchStart = 0;
  private pinchStartDistance = 0;
  private tapStart: { x: number; y: number; t: number; id: number } | null = null;
  private tapCancelled = false;
  private goalDistance: number;
  private goalTarget: THREE.Vector3 | null = null;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly el: HTMLElement,
    private readonly opts: OrbitCameraOptions,
  ) {
    this.goalDistance = this.distance;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Glide the view to look at `center`, optionally from `distance`. */
  focus(center: THREE.Vector3, distance?: number): void {
    this.goalTarget = center.clone();
    if (distance !== undefined) this.goalDistance = this.clampDistance(distance);
  }

  setDistance(d: number): void {
    this.distance = this.goalDistance = THREE.MathUtils.clamp(d, this.opts.minDistance, this.opts.maxDistance);
  }

  private onDown = (e: PointerEvent): void => {
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.velAz = this.velPolar = 0;
    this.lastMoveMs = performance.now();
    if (this.pointers.size === 1) {
      this.tapStart = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
      this.tapCancelled = false;
    } else {
      this.tapCancelled = true;
      if (this.pointers.size === 2) {
        this.pinchStart = this.pinchSpan();
        this.pinchStartDistance = this.goalDistance;
      }
    }
  };

  private onMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;

    if (this.tapStart && Math.hypot(e.clientX - this.tapStart.x, e.clientY - this.tapStart.y) > TAP_MAX_MOVE_PX) {
      this.tapCancelled = true;
    }

    if (this.pointers.size === 1) {
      const dAz = -dx * ROTATE_SPEED;
      const dPolar = -dy * ROTATE_SPEED;
      this.azimuth += dAz;
      this.polar += dPolar;
      // Remember a smoothed drag speed for a little inertia after release.
      const now = performance.now();
      const dt = THREE.MathUtils.clamp((now - this.lastMoveMs) / 1000, 1 / 240, 0.1);
      this.lastMoveMs = now;
      this.velAz = this.velAz * 0.5 + (dAz / dt) * 0.5;
      this.velPolar = this.velPolar * 0.5 + (dPolar / dt) * 0.5;
    } else if (this.pointers.size === 2 && this.pinchStart > 0) {
      const span = this.pinchSpan();
      if (span > 0) this.goalDistance = this.clampDistance(this.pinchStartDistance * (this.pinchStart / span));
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);

    const tap = this.tapStart;
    if (e.type === 'pointerup' && tap && tap.id === e.pointerId && !this.tapCancelled && performance.now() - tap.t < TAP_MAX_MS) {
      this.velAz = this.velPolar = 0;
      this.onTap?.(e.clientX, e.clientY);
    }
    // A finger that stopped before lifting should not fling.
    if (performance.now() - this.lastMoveMs > 80) this.velAz = this.velPolar = 0;
    if (this.pointers.size === 0) this.tapStart = null;
    if (this.pointers.size < 2) this.pinchStart = 0;
    if (this.pointers.size === 1) {
      // Lifting one finger of a pinch should not fling the camera.
      this.velAz = this.velPolar = 0;
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.goalDistance = this.clampDistance(this.goalDistance * Math.exp(e.deltaY * 0.0012));
  };

  private pinchSpan(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private clampDistance(d: number): number {
    return THREE.MathUtils.clamp(d, this.opts.minDistance, this.opts.maxDistance);
  }

  update(dt: number): void {
    if (this.pointers.size === 0) {
      this.azimuth += this.velAz * dt;
      this.polar += this.velPolar * dt;
      const decay = Math.exp(-DAMPING * dt);
      this.velAz *= decay;
      this.velPolar *= decay;
    }
    this.distance += (this.goalDistance - this.distance) * (1 - Math.exp(-12 * dt));
    if (this.goalTarget) {
      this.target.lerp(this.goalTarget, 1 - Math.exp(-5 * dt));
      if (this.target.distanceToSquared(this.goalTarget) < 1e-4) this.goalTarget = null;
    }

    // Never look straight down the pole, and never dip below the floor (Earth).
    const below = this.target.y - this.opts.floorY;
    const maxPolar = Math.min(Math.PI * 0.94, Math.acos(THREE.MathUtils.clamp(-below / this.distance, -1, 1)));
    this.polar = THREE.MathUtils.clamp(this.polar, 0.08, maxPolar);

    const s = Math.sin(this.polar);
    this.camera.position.set(
      this.target.x + this.distance * s * Math.sin(this.azimuth),
      this.target.y + this.distance * Math.cos(this.polar),
      this.target.z + this.distance * s * Math.cos(this.azimuth),
    );
    this.camera.lookAt(this.target);
  }
}
