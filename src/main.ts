// Wires the sim, the 3D view, and the HTML overlay together, and runs the frame loop.
import './ui/styles.css';
import * as THREE from 'three';
import modulesJson from './data/modules.json';
import scenarioJson from './data/scenario.json';
import { parseModuleDefs, parseScenario } from './sim/data';
import { forecast } from './sim/forecast';
import { phaseAt, sunlightAt } from './sim/orbit';
import { Simulation } from './sim/simulation';
import { indexDefs, mountPort } from './sim/station';
import { Clock, SPEEDS, type Speed } from './sim/time';
import { BuildPanel, previewRows } from './ui/buildPanel';
import { connectEventFeed } from './ui/eventFeed';
import { Hud } from './ui/hud';
import { ModuleSheet } from './ui/moduleSheet';
import { Toasts } from './ui/toasts';
import { BuildView, type PortRef } from './view/buildView';
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
  const models = new ModuleModelLoader();
  const stationView = new StationView(defsById, models);
  env.scene.add(stationView.root);
  const buildView = new BuildView(stationView, models);
  env.scene.add(buildView.root);

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
    defsById,
  );
  connectEventFeed(sim.events, toasts, (id) => snap.modules.find((m) => m.id === id)?.name ?? id);

  // ---- Build mode: tray → tap a port → preview → build ----
  const PREVIEW_MINUTES = Math.ceil(sim.orbit.periodMinutes * 2);
  let build: { defId: string; via: string; step: 'placing' | 'preview'; target: PortRef | null; fits: number } | null = null;
  const exitBuild = () => {
    build = null;
    buildView.clear();
    buildPanel.close();
  };
  const pickModule = async (defId: string) => {
    const def = defsById.get(defId);
    const via = def && mountPort(def);
    if (!def || !via) return;
    build = { defId, via, step: 'placing', target: null, fits: 0 };
    const candidates = snap.freePorts.filter((p) => sim.buildProblem(defId, p.moduleId, p.portId) === null);
    const fits = await buildView.showPorts(def, via, candidates);
    if (build?.defId !== defId) return;
    build.fits = fits.length;
    buildPanel.showPlacing(def.name, fits.length);
  };
  const previewAt = async (ref: PortRef) => {
    if (!build) return;
    const current = build;
    const def = defsById.get(current.defId)!;
    current.step = 'preview';
    current.target = ref;
    const blocker = await buildView.showGhost(def, current.via, ref);
    if (build !== current || current.target !== ref) return;
    const portName = `${stationView.moduleName(ref.moduleId)}, ${ref.portId} port`;
    const blockedBy = blocker ? stationView.moduleName(blocker) : null;
    buildPanel.showPreview(def.name, `On the ${portName}. Over the next two orbits:`, null, blockedBy);
    // Let the panel paint, then run the two forecasts (fast: the sim is headless).
    setTimeout(() => {
      if (build !== current || current.target !== ref) return;
      const base = forecast(sim, PREVIEW_MINUTES);
      const next = forecast(sim, PREVIEW_MINUTES, { type: 'addModule', defId: current.defId, to: ref.moduleId, port: ref.portId });
      if (!base || !next) return buildPanel.showPreview(def.name, 'That port is no longer free.', [], 'station');
      buildPanel.showPreview(def.name, `On the ${portName}. Over the next two orbits:`, previewRows(base, next), blockedBy);
    }, 30);
  };
  const buildPanel = new BuildPanel(ui, defs, {
    onOpen: () => {
      select(null);
      buildPanel.showTray();
    },
    onClose: exitBuild,
    onPick: (defId) => void pickModule(defId),
    onBack: () => {
      if (!build) return;
      if (build.step === 'preview') {
        build.step = 'placing';
        build.target = null;
        buildView.clearGhost();
        buildPanel.showPlacing(defsById.get(build.defId)!.name, build.fits);
      } else {
        build = null;
        buildView.clear();
        buildPanel.showTray();
      }
    },
    onConfirm: () => {
      if (!build?.target) return;
      const { defId, target } = build;
      const result = sim.command({ type: 'addModule', defId, to: target.moduleId, port: target.portId });
      if (!result.ok) {
        toasts.show(`Can't build there: ${result.reason}.`, 'warn');
        return;
      }
      snap = sim.snapshot();
      exitBuild();
      void stationView.sync(snap).then(() => {
        const b = stationView.bounds();
        cam.focus(b.center, Math.max(cam.distance, b.radius * (env.camera.aspect < 0.8 ? 3.4 : 2.4)));
      });
      toasts.show(`${defsById.get(defId)!.name} built on the ${stationView.moduleName(target.moduleId)}.`, 'ok');
    },
  });

  const ndc = new THREE.Vector2();
  cam.onTap = (x, y) => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    if (build) {
      const ref = buildView.pickPort(ndc, env.camera);
      if (ref) void previewAt(ref);
      return;
    }
    select(stationView.pick(ndc, env.camera));
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      e.preventDefault();
      clock.togglePause();
    } else if (e.key === 'Escape') {
      if (build || buildPanel.isOpen) exitBuild();
      else select(null);
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
    buildView.update(dt, env.camera);
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
