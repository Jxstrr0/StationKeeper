// Wires the sim, the 3D view, and the HTML overlay together, and runs the frame loop.
import './ui/styles.css';
import './ui/finance.css';
import './ui/menus.css';
import './ui/help.css';
import { Sound } from './audio/sound';
import * as THREE from 'three';
import modulesJson from './data/modules.json';
import { SCENARIOS, scenarioById } from './scenarios';
import { parseModuleDefs } from './sim/data';
import { loadGame, replaceGame, saveGame, simFromSave, skipTitleOnce, startNewGame, takeChosenScenario, takeSkipTitle } from './persist';
import { clearSlot, makeSlotFile, parseImport, readSlot, readSlots, writeSlot, type SlotMeta } from './slots';
import { loadSettings, saveSettings, UI_ZOOM, type Settings } from './settings';
import { loadRecords, recordLoss, recordWin } from './records';
import { forecast } from './sim/forecast';
import { phaseAt, sunlightAt } from './sim/orbit';
import { SAVE_VERSION, Simulation } from './sim/simulation';
import { indexDefs, mountPort } from './sim/station';
import { Clock, SPEEDS, type Speed } from './sim/time';
import { BuildPanel, previewRows } from './ui/buildPanel';
import { EndSheet, type EndKind } from './ui/endSheet';
import { CrewPanel } from './ui/crewPanel';
import { connectEventFeed } from './ui/eventFeed';
import { FinancePanel } from './ui/financePanel';
import { formatDate, money } from './ui/format';
import { goalLine } from './ui/goalText';
import { ScenarioPicker } from './ui/scenarioPicker';
import { Hud } from './ui/hud';
import { dataUrlToBlob, deliverFile } from './ui/download';
import { HelpSheet } from './ui/helpSheet';
import { PauseMenu } from './ui/pauseMenu';
import { SavesSheet } from './ui/savesSheet';
import { PhotoBar } from './ui/photoBar';
import { SettingsSheet } from './ui/settingsSheet';
import { TitleScreen } from './ui/titleScreen';
import { ModuleSheet } from './ui/moduleSheet';
import { ReportSheet } from './ui/reportSheet';
import { Toasts } from './ui/toasts';
import { WarningsPanel } from './ui/warningsPanel';
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
  // Pick up a saved game if there is one; it starts paused so the player can get their bearings.
  const loaded = loadGame(defs);
  const chosen = takeChosenScenario();
  // A new game or a loaded slot reloads straight into play; any other visit opens on the title screen.
  const skipTitle = takeSkipTitle() || chosen !== null;
  const scenario = loaded.kind === 'loaded' ? loaded.sim.scenario : (scenarioById(chosen ?? '') ?? SCENARIOS[0]!);
  const sim = loaded.kind === 'loaded' ? loaded.sim : new Simulation(defs, scenario);
  const clock = new Clock();
  if (loaded.kind === 'loaded') clock.setSpeed(0);
  if (loaded.kind === 'discarded') console.warn(`Saved game discarded: ${loaded.reason}`);

  const canvas = byId<HTMLCanvasElement>('scene');
  const ui = byId<HTMLDivElement>('ui');
  const boot = byId<HTMLDivElement>('boot');

  const env = createScene(canvas);
  const models = new ModuleModelLoader();
  const stationView = new StationView(defsById, models);
  env.scene.add(stationView.root);
  const buildView = new BuildView(stationView, models);
  env.scene.add(buildView.root);

  // Dev server only: the sim and views on window, for poking at from the console. Not in production builds.
  if (import.meta.env.DEV) Object.assign(window, { __sim: sim, __station: stationView, __build: buildView, __defs: defsById, __env: env });

  const cam = new OrbitCamera(env.camera, canvas, { minDistance: 14, maxDistance: 420, floorY: -ALTITUDE + 8 });

  let snap = sim.snapshot();
  await stationView.sync(snap);
  const frame = stationView.bounds();
  cam.target.copy(frame.center);
  let fitRadius = frame.radius;
  cam.setDistance(env.fitDistance(fitRadius));

  // ---- Sound: nothing plays until the first tap or key, which is when browsers allow it ----
  const sound = new Sound();
  const unlockSound = () => sound.unlock();
  window.addEventListener('pointerdown', unlockSound, true);
  window.addEventListener('keydown', unlockSound, true);
  sound.setAmbient(true);

  // ---- UI ----
  const hud = new Hud(ui, {
    // The quarterly report holds the game paused until Continue.
    onSpeed: (s) => {
      if (!report.isOpen && !ending.isOpen && !picker.isOpen && !menu.isOpen && !title.isOpen && !sim.ended) clock.setSpeed(s);
    },
    onMenu: () => openMenu(),
    onHeatOverlay: (on) => stationView.setHeatOverlay(on),
    onCrew: () => {
      if (crew.isOpen) return crew.close();
      exitBuild();
      select(null);
      warnings.close();
      finance.close();
      crew.close();
      crew.open();
      crew.update(snap);
    },
  });
  const toasts = new Toasts(ui);
  toasts.onShow = (kind) => sound.play(kind === 'alarm' ? 'alarm' : kind === 'warn' ? 'warn' : 'toast');
  // Every button in the overlay ticks.
  ui.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('button')) sound.play('click');
  });
  const select = (id: string | null) => {
    stationView.select(id);
    if (id) {
      sheet.open(id);
      warnings.close();
      finance.close();
      crew.close();
    } else sheet.close();
    sheet.update(snap);
  };
  /** Send a command from a button, refresh the snapshot, and say why if the sim refuses. */
  const send = (cmd: Parameters<typeof sim.command>[0]) => {
    const result = sim.command(cmd);
    snap = sim.snapshot();
    if (!result.ok) toasts.show(`${result.reason}.`, 'warn');
  };
  const crew = new CrewPanel(ui, {
    onClose: () => crew.close(),
    onHire: (role) => send({ type: 'hireCrew', role }),
    onDismiss: (crewId) => send({ type: 'dismissCrew', crewId }),
    onBonus: () => send({ type: 'payBonus' }),
  }, sim.forSale('research-lab') || sim.snapshot().modules.some((m) => m.kind === 'lab') ? ['engineer', 'scientist'] : ['engineer']);
  const sheet = new ModuleSheet(
    ui,
    {
      onClose: () => select(null),
      onToggle: (moduleId, enabled) => send({ type: 'setModuleEnabled', moduleId, enabled }),
      onRepair: (moduleId) => send({ type: 'repair', moduleId }),
      onCancelRepair: (moduleId) => send({ type: 'cancelRepair', moduleId }),
    },
    defsById,
    scenario.reliability.repairFactor,
  );
  // Events fire mid-tick, so a module that just docked isn't in the frame's snapshot yet: fall back to a fresh one.
  const moduleSnap = (id: string) => snap.modules.find((m) => m.id === id) ?? sim.snapshot().modules.find((m) => m.id === id);
  connectEventFeed(
    sim.events,
    toasts,
    (id) => moduleSnap(id)?.name ?? id,
    (id) => moduleSnap(id)?.kind ?? 'core',
    (defId) => defsById.get(defId)?.name ?? defId,
  );
  const warnings = new WarningsPanel(ui, defsById, scenario.reliability.repairFactor, {
    onOpen: () => {
      exitBuild();
      select(null);
      finance.close();
      crew.close();
      warnings.open();
      warnings.update(snap);
    },
    onClose: () => warnings.close(),
    onShow: (moduleId) => {
      select(moduleId);
      const c = stationView.moduleCenter(moduleId);
      if (c) cam.focus(c);
    },
    onRepair: (moduleId) => send({ type: 'repair', moduleId }),
    onCancelRepair: (moduleId) => send({ type: 'cancelRepair', moduleId }),
    onSwitchOn: (moduleId) => send({ type: 'setModuleEnabled', moduleId, enabled: true }),
  });
  const finance = new FinancePanel(ui, {
    onOpen: () => {
      exitBuild();
      select(null);
      warnings.close();
      crew.close();
      finance.open();
      finance.update(snap);
    },
    onClose: () => finance.close(),
    onAccept: (uid) => send({ type: 'acceptContract', uid }),
    onAbandon: (uid) => send({ type: 'abandonContract', uid }),
    onRepay: (amount) => send({ type: 'repayLoan', amount }),
    onNewGame: () => newGame(),
  }, scenario.goal, scenario.economy.contracts.pool.length > 0);
  // A new station: choose a scenario, then reload into it.
  const picker = new ScenarioPicker(ui, SCENARIOS, (id) => {
    saving = false;
    startNewGame(id);
    location.reload();
  }, loadRecords);
  const newGame = () => {
    clock.setSpeed(0);
    finance.close();
    crew.close();
    picker.show();
  };

  // ---- Title screen, pause menu, settings, photo mode ----
  const closePanels = () => {
    exitBuild();
    select(null);
    warnings.close();
    finance.close();
    crew.close();
  };
  let started = false; // whether the player has carried on into this station since the page loaded
  const title = new TitleScreen(ui, {
    onContinue: () => enterPlay(),
    onNewStation: () => picker.show(),
    onLoad: () => openSaves(),
    onHelp: () => help.show(),
    onSettings: () => settingsSheet.show(),
  });
  /** What the title's Continue button carries on with, or null for a station nobody has played yet. */
  const resumeLine = (): string | null => {
    if (!started && loaded.kind !== 'loaded') return null;
    const s = sim.snapshot();
    return `${scenario.name} · ${formatDate(s.timeMs)} · ${sim.ended ? 'ended' : money(s.economy.cash)}`;
  };
  const enterTitle = () => {
    clock.setSpeed(0);
    closePanels();
    ui.classList.add('title-mode');
    title.show(resumeLine());
    cam.spin = settings.reducedMotion ? 0 : 0.05;
    keepingZoom(measureInsets);
  };
  const enterPlay = () => {
    title.hide();
    ui.classList.remove('title-mode');
    cam.spin = 0;
    keepingZoom(measureInsets);
    if (started) return;
    started = true;
    if (sim.ended) {
      showEnding(sim.snapshot().ending.outcome ?? 'bankrupt');
    } else if (loaded.kind === 'loaded') {
      toasts.show(`Welcome back. Your station is as you left it, paused on ${formatDate(snap.timeMs)}. Press play to carry on.`, 'ok');
    } else {
      clock.setSpeed(1);
      toasts.show(`${scenario.name}. ${goalLine(scenario.goal)} The goal is in Finance.`, 'ok');
      if (Object.keys(loadRecords()).length === 0 && loaded.kind === 'none') toasts.show('New to this? How to play is in the menu, top right.', 'ok');
    }
    if (loaded.kind === 'discarded') toasts.show("Your saved station couldn't be loaded after an update, so here's a fresh one.", 'warn');
  };

  let menuResume: Speed = 1;
  const openMenu = () => {
    if (menu.isOpen || help.isOpen || saves.isOpen || title.isOpen || photo.isOpen || report.isOpen || ending.isOpen || picker.isOpen) return;
    menuResume = clock.speed;
    clock.setSpeed(0);
    const s = sim.snapshot();
    menu.show(`${scenario.name} · day ${Math.floor(s.minutes / 1440) + 1} · ${formatDate(s.timeMs)}`);
    sound.play('open');
  };
  const resumeFromMenu = () => {
    menu.close();
    sound.play('close');
    if (!sim.ended && !report.isOpen && !ending.isOpen) clock.setSpeed(menuResume);
  };
  const menu = new PauseMenu(ui, {
    onResume: resumeFromMenu,
    onSaves: () => openSaves(),
    onRestart: () => {
      saving = false;
      startNewGame(sim.scenario.id);
      location.reload();
    },
    onSettings: () => settingsSheet.show(),
    onHelp: () => help.show(),
    onPhoto: () => {
      menu.close();
      closePanels();
      ui.classList.add('photo-mode');
      photo.show();
      keepingZoom(measureInsets);
    },
    onQuit: () => {
      menu.close();
      autosave(true);
      enterTitle();
    },
  });
  const exitPhoto = () => {
    photo.hide();
    ui.classList.remove('photo-mode');
    keepingZoom(measureInsets);
    openMenu();
  };
  const photo = new PhotoBar(
    ui,
    () => {
      let url: string;
      try {
        url = env.capture();
      } catch {
        toasts.show("The camera wouldn't take that one.", 'warn');
        return;
      }
      photo.blink();
      sound.play('shutter');
      const day = new Date(snap.timeMs).toISOString().slice(0, 10);
      deliverFile(dataUrlToBlob(url), `station-keeper-${day}.png`);
    },
    exitPhoto,
  );

  const help = new HelpSheet(ui, { onClose: () => undefined });

  // ---- Save slots and files ----
  const currentLine = (): string | null => resumeLine();
  const openSaves = () => saves.show(title.isOpen ? null : currentLine(), readSlots(SAVE_VERSION));
  const refreshSaves = () => saves.update(title.isOpen ? null : currentLine(), readSlots(SAVE_VERSION));
  /** Load a save into the game: it replaces the autosave, and the page reloads straight into play. */
  const playSave = (save: Parameters<typeof replaceGame>[0]): void => {
    try {
      simFromSave(defs, save);
    } catch {
      toasts.show("That save doesn't fit this version of the game, so it can't be loaded.", 'warn');
      return;
    }
    saving = false; // don't let the closing page autosave the old station over the one being loaded
    if (!replaceGame(save)) {
      saving = true;
      toasts.show("This browser wouldn't store the station, so it can't be loaded here.", 'warn');
      return;
    }
    skipTitleOnce();
    location.reload();
  };
  const slotMeta = (thumb: string | null): SlotMeta => {
    const s = sim.snapshot();
    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      timeMs: s.timeMs,
      minutes: s.minutes,
      cash: s.economy.cash,
      modules: s.modules.length,
      ended: sim.ended,
      savedAtMs: Date.now(),
      thumb,
    };
  };
  const saves = new SavesSheet(ui, {
    onSave: (i) => {
      let thumb: string | null = null;
      try {
        thumb = env.thumbnail(192);
      } catch {
        // No picture, then; the slot still saves.
      }
      if (writeSlot(i, makeSlotFile(slotMeta(thumb), sim.save()))) toasts.show(`Saved to slot ${i + 1}.`, 'ok');
      else toasts.show("This browser wouldn't store that save. It may be full, or in a private window.", 'warn');
      refreshSaves();
    },
    onLoad: (i) => {
      const slot = readSlot(i, SAVE_VERSION);
      if (slot.kind === 'ok') playSave(slot.file.save);
      else refreshSaves();
    },
    onDelete: (i) => {
      clearSlot(i);
      refreshSaves();
    },
    onExport: () => {
      const day = new Date(snap.timeMs).toISOString().slice(0, 10);
      const blob = new Blob([JSON.stringify(makeSlotFile(slotMeta(null), sim.save()))], { type: 'application/json' });
      deliverFile(blob, `station-keeper-${scenario.id}-${day}.json`);
    },
    onImport: (file) => {
      file
        .text()
        .then((text) => {
          const result = parseImport(text, SAVE_VERSION);
          if (result.ok) playSave(result.save);
          else toasts.show(`${result.reason}.`, 'warn');
        })
        .catch(() => toasts.show("That file couldn't be read.", 'warn'));
    },
    onClose: () => saves.close(),
  });

  let settings: Settings = loadSettings();
  const applySettings = () => {
    ui.style.setProperty('--ui-zoom', String(UI_ZOOM[settings.uiSize]));
    document.documentElement.classList.toggle('reduce-motion', settings.reducedMotion);
    env.setQuality(settings.quality);
    cam.inertia = !settings.reducedMotion;
    if (title.isOpen) cam.spin = settings.reducedMotion ? 0 : 0.05;
    hud.setClock24(settings.clock24);
    sound.setVolume(settings.volume);
    sound.setMuted(settings.muted);
  };
  const settingsSheet = new SettingsSheet(
    ui,
    settings,
    (next) => {
      settings = next;
      saveSettings(settings);
      applySettings();
      keepingZoom(measureInsets);
    },
    () => settingsSheet.close(),
  );
  applySettings();

  // The books close each quarter: pause on the report until the player carries on.
  const report = new ReportSheet(ui);
  sim.events.on('quarterReport', ({ report: r }) => {
    sound.play('report');
    const resume = clock.speed;
    clock.setSpeed(0);
    exitBuild();
    select(null);
    warnings.close();
    finance.close();
    crew.close();
    report.show(r, () => {
      if (!sim.ended && !ending.isOpen) clock.setSpeed(resume);
    });
  });

  // The end of the game, or the goal reached. A loss holds the game for good; the goal lets play carry on.
  let goalResume: Speed = 1;
  const ending = new EndSheet(ui, {
    onKeepGoing: () => {
      if (!report.isOpen) clock.setSpeed(goalResume);
    },
    onNewGame: () => newGame(),
  });
  const showEnding = (kind: EndKind) => {
    clock.setSpeed(0);
    exitBuild();
    select(null);
    warnings.close();
    finance.close();
    crew.close();
    const s = sim.snapshot();
    ending.show(kind, s.ending.goal, {
      days: s.minutes / 1440,
      cash: s.economy.cash,
      loan: s.economy.loan,
      modules: s.modules.length,
      lifetimeNet: Object.values(sim.lifetimeLedger).reduce((a, b) => a + b, 0),
    });
  };
  // Each ending is recorded once: the events fire only on the tick it happens, never again after a reload.
  sim.events.on('gameOver', ({ outcome }) => {
    sound.play('lose');
    recordLoss(sim.scenario.id, outcome);
    if (report.isOpen) report.close(); // its Continue won't restart a lost game
    showEnding(outcome);
    autosave(true);
  });
  sim.events.on('goalReached', ({ minutes }) => {
    sound.play('win');
    recordWin(sim.scenario.id, minutes);
    goalResume = clock.speed === 0 ? 1 : clock.speed;
    showEnding('goal');
  });
  // A module docks on a later tick than it was ordered, so the 3D view catches up in the frame loop.
  let needsSync = false;
  sim.events.on('moduleAdded', () => {
    needsSync = true;
    sound.play('docked');
  });

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
    if ((def.price ?? 0) > snap.economy.cash) {
      buildPanel.showPlacing(def.name, 0, `Not enough cash: the ${def.name} costs ${money(def.price ?? 0)}.`);
      return;
    }
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
    const problem = sim.buildProblem(current.defId, ref.moduleId, ref.portId);
    const blocked = blocker ? `Blocked: it would run into the ${stationView.moduleName(blocker)}.` : problem ? `${problem}.` : null;
    const hours = scenario.economy.deliveryHours;
    const sub = `${money(def.price ?? 0)}, docks on the ${portName} in ${hours} h. Over the next two orbits after that:`;
    buildPanel.showPreview(def.name, sub, blocked ? [] : null, blocked);
    if (blocked) return;
    // Let the panel paint, then run the two forecasts (fast: the sim is headless).
    setTimeout(() => {
      if (build !== current || current.target !== ref) return;
      const base = forecast(sim, PREVIEW_MINUTES);
      const next = forecast(sim, PREVIEW_MINUTES, { type: 'addModule', defId: current.defId, to: ref.moduleId, port: ref.portId });
      if (!base || !next) return buildPanel.showPreview(def.name, sub, [], 'That port is no longer free.');
      buildPanel.showPreview(def.name, sub, previewRows(base, next), null);
    }, 30);
  };
  const buildPanel = new BuildPanel(ui, defs.filter((d) => sim.forSale(d.id)), {
    onOpen: () => {
      select(null);
      warnings.close();
      finance.close();
      crew.close();
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
        toasts.show(`Can't order that: ${result.reason}.`, 'warn');
        return;
      }
      snap = sim.snapshot();
      exitBuild();
      sound.play('build');
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
    if (help.isOpen) {
      e.preventDefault();
      if (e.key === 'Escape') help.close();
      else help.keydown(e.key);
      return;
    }
    if (saves.isOpen) {
      if (e.key === 'Escape') saves.close();
      return;
    }
    if (settingsSheet.isOpen) {
      if (e.key === 'Escape') settingsSheet.close();
      return;
    }
    if (photo.isOpen) {
      if (e.key === 'Escape') exitPhoto();
      return;
    }
    if (picker.isOpen) {
      e.preventDefault();
      if (e.key === 'Escape') picker.close();
      return;
    }
    if (menu.isOpen) {
      if (e.key === 'Escape') resumeFromMenu();
      return;
    }
    if (title.isOpen) {
      if (e.key === 'Enter') title.root.querySelector<HTMLButtonElement>('.title-btn.primary')?.click();
      return;
    }
    if (ending.isOpen) {
      // A loss takes a deliberate tap on New station; the goal sheet closes with Escape or Enter.
      e.preventDefault();
      if (e.key === 'Escape' || e.key === 'Enter') ending.keepGoing();
      return;
    }
    if (report.isOpen) {
      // Nothing behind the report gets a key: Escape or Enter is Continue, and the rest do nothing.
      e.preventDefault();
      if (e.key === 'Escape' || e.key === 'Enter') report.close();
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      clock.togglePause();
    } else if (e.key === 'Escape') {
      if (build || buildPanel.isOpen) exitBuild();
      else if (warnings.isOpen) warnings.close();
      else if (finance.isOpen) finance.close();
      else if (crew.isOpen) crew.close();
      else if (sheet.openId) select(null);
      else openMenu();
    } else if (/^[1-4]$/.test(e.key)) {
      clock.setSpeed(SPEEDS[Number(e.key) - 1] as Speed);
    }
  });
  // Keep the station in the gap between the HUD and the bottom buttons. Only UI that crosses the
  // middle third of the screen counts.
  const measureInsets = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const crossesMiddle = (r: DOMRect): boolean => r.width > 0 && r.height > 0 && r.left < w * 0.66 && r.right > w * 0.34;
    if (title.isOpen) {
      // Portrait: the station sits between the wordmark and the buttons. Landscape: between them side by side, so no insets.
      if (w > h) return env.setInsets(0, 0);
      const head = title.head.getBoundingClientRect();
      const foot = title.foot.getBoundingClientRect();
      env.setInsets(crossesMiddle(head) ? Math.round(head.bottom) : 0, crossesMiddle(foot) ? Math.round(h - foot.top) : 0);
      return;
    }
    let top = 0;
    for (const child of hud.root.children) {
      const r = child.getBoundingClientRect();
      // Landscape screens have room beside the HUD, so it only pushes the view down in portrait.
      if (w < h && crossesMiddle(r) && r.top < h / 2) top = Math.max(top, r.bottom);
    }
    let bottom = 0;
    for (const b of document.querySelectorAll('.warn-fab, .fin-fab, .build-fab')) {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.top > h / 2) bottom = Math.max(bottom, h - r.top);
    }
    env.setInsets(Math.round(top), Math.round(bottom));
  };
  // When the screen changes shape, keep the player's zoom relative to what fits.
  const keepingZoom = (change: () => void): void => {
    const before = env.fitDistance(fitRadius);
    change();
    const after = env.fitDistance(fitRadius);
    if (Math.abs(after - before) > 0.5) cam.setDistance(cam.distance * (after / before));
  };
  window.addEventListener('resize', () => keepingZoom(measureInsets)); // the canvas itself is resized in the frame loop
  new ResizeObserver(measureInsets).observe(hud.root); // a warning line in the HUD recentres the view but leaves the zoom alone
  measureInsets();
  cam.setDistance(env.fitDistance(fitRadius));

  // ---- Saving: every few seconds while the clock runs, and whenever the page is hidden or closed ----
  const SAVE_EVERY_MS = 5000;
  let saving = true;
  let savedAt = sim.elapsedMinutes;
  let lastSaveMs = performance.now();
  let warnedNoSave = false;
  const autosave = (force = false) => {
    if (!saving) return;
    if (!force && sim.elapsedMinutes === savedAt) return;
    if (!saveGame(sim) && !warnedNoSave) {
      warnedNoSave = true;
      toasts.show("This browser won't keep a save, so the station won't survive a reload.", 'warn');
    }
    savedAt = sim.elapsedMinutes;
    lastSaveMs = performance.now();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') autosave(true);
  });
  window.addEventListener('pagehide', () => autosave(true));

  if (skipTitle) enterPlay();
  else enterTitle();

  // ---- Frame loop ----
  let last = performance.now();
  let alarmBefore = snap.warnings.some((w) => w.severity === 'alarm');
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    const realDt = (now - last) / 1000;
    last = now;
    keepingZoom(() => {
      if (env.ensureSize()) measureInsets();
    });

    const ticks = clock.advance(realDt);
    if (ticks > 0) {
      // Stop early if a tick paused the game (the quarterly report does).
      for (let i = 0; i < ticks && clock.speed !== 0; i++) sim.tick();
      snap = sim.snapshot();
    }
    if (needsSync) {
      needsSync = false;
      snap = sim.snapshot(); // fresh: a module can dock outside a tick (the dev console's deliverAll)
      void stationView.sync(snap).then(() => {
        const b = stationView.bounds();
        fitRadius = b.radius;
        cam.focus(b.center, Math.max(cam.distance, env.fitDistance(b.radius)));
      });
    }

    // Interpolate the orbit between ticks so the light and Earth move smoothly.
    const t = snap.minutes + (clock.speed === 0 ? 0 : clock.alpha);
    const phase = phaseAt(sim.orbit, t);
    const sunlight = sunlightAt(sim.orbit, phase);
    env.update(snap.orbit, phase, sunlight);
    sound.setEclipse(1 - sunlight);
    sound.setPace(clock.speed / 20);
    // A new alarm gets the master-alarm tone once, when it first appears.
    const alarmNow = snap.warnings.some((w) => w.severity === 'alarm');
    if (alarmNow && !alarmBefore) sound.play('alarm');
    alarmBefore = alarmNow;
    env.earth.setCloudShift(t * 0.0006);

    stationView.update(snap, env.sunDir, dt);
    buildView.update(dt, env.camera);
    cam.update(dt);
    hud.update(snap, clock.speed);
    sheet.update(snap);
    warnings.update(snap);
    finance.update(snap);
    crew.update(snap);
    buildPanel.setCash(snap.economy.cash);
    void stationView.syncOrders(snap.economy.deliveries);
    if (now - lastSaveMs > SAVE_EVERY_MS) autosave();
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
