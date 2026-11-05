// Wires the sim, the 3D view, and the HTML overlay together, and runs the frame loop.
import './ui/styles.css';
import * as THREE from 'three';
import modulesJson from './data/modules.json';
import scenarioJson from './data/scenario.json';
import { parseModuleDefs, parseScenario } from './sim/data';
import { phaseAt, sunlightAt } from './sim/orbit';
import { Simulation } from './sim/simulation';
import { indexDefs } from './sim/station';
import { Clock, SPEEDS, type Speed } from './sim/time';
import { connectEventFeed } from './ui/eventFeed';
import { Hud } from './ui/hud';
import { ModuleSheet } from './ui/moduleSheet';
import { Toasts } from './ui/toasts';
import { OrbitCamera } from './view/camera';
import { ModuleModelLoader } from './view/moduleModels';
import { ALTITUDE, createScene } from './view/scene';
import { StationView } from './view/stationView';

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

async function start(): Promise<void> {
  const defs = parseModuleDefs(modulesJson);
  const defsById = indexDefs(defs);
  const sim = new Simulation(defs, parseScenario(scenarioJson));
  const clock = new Clock();

  const canvas = byId<HTMLCanvasElement>('scene');
  const ui = byId<HTMLDivElement>('ui');
  const boot = byId<HTMLDivElement>('boot');

  const env = createScene(canvas);
  const stationView = new StationView(defsById, new ModuleModelLoader());
  env.scene.add(stationView.root);

  const cam = new OrbitCamera(env.camera, canvas, { minDistance: 12, maxDistance: 170, floorY: -ALTITUDE + 8 });

  let snap = sim.snapshot();
  await stationView.sync(snap);
  const frame = stationView.bounds();
  cam.target.copy(frame.center);
  cam.setDistance(frame.radius * (env.camera.aspect < 0.8 ? 3.4 : 2.4));

  // ---- UI ----
  const hud = new Hud(ui, {
    onSpeed: (s) => clock.setSpeed(s),
    onHeatOverlay: (on) => stationView.setHeatOverlay(on),
  });
  const toasts = new Toasts(ui);
  const descriptions = new Map(defs.map((d) => [d.id, d.description]));
  const select = (id: string | null) => {
    stationView.select(id);
    if (id) sheet.open(id);
    else sheet.close();
    sheet.update(snap);
  };
  const sheet = new ModuleSheet(
    ui,
    {
      onClose: () => select(null),
      onToggle: (moduleId, enabled) => {
        sim.command({ type: 'setModuleEnabled', moduleId, enabled });
        snap = sim.snapshot();
      },
    },
    descriptions,
  );
  connectEventFeed(sim.events, toasts, (id) => snap.modules.find((m) => m.id === id)?.name ?? id);

  const ndc = new THREE.Vector2();
  cam.onTap = (x, y) => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    select(stationView.pick(ndc, env.camera));
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      e.preventDefault();
      clock.togglePause();
    } else if (e.key === 'Escape') {
      select(null);
    } else if (/^[1-4]$/.test(e.key)) {
      clock.setSpeed(SPEEDS[Number(e.key) - 1] as Speed);
    }
  });
  window.addEventListener('resize', () => env.resize());

  // ---- Frame loop ----
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    const realDt = (now - last) / 1000;
    last = now;

    const ticks = clock.advance(realDt);
    if (ticks > 0) {
      for (let i = 0; i < ticks; i++) sim.tick();
      snap = sim.snapshot();
    }

    // Interpolate the orbit between ticks so the light and Earth move smoothly.
    const t = snap.minutes + (clock.speed === 0 ? 0 : clock.alpha);
    const phase = phaseAt(sim.orbit, t);
    env.update(snap.orbit, phase, sunlightAt(sim.orbit, phase));
    env.earth.setCloudShift(t * 0.0006);

    stationView.update(snap, env.sunDir, dt);
    cam.update(dt);
    hud.update(snap, clock.speed);
    sheet.update(snap);
    env.render();
    env.adapt(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  boot.classList.add('done');
  setTimeout(() => boot.remove(), 600);
}

start().catch((err: unknown) => {
  console.error(err);
  const boot = document.getElementById('boot');
  if (boot) {
    boot.classList.add('error');
    boot.textContent = `Station Keeper could not start: ${err instanceof Error ? err.message : String(err)}`;
  }
});
