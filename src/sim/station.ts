// The station as a graph of module instances joined at ports.
import type { Attachment, LayoutEntry, ModuleDef } from './types';

export interface ModuleInstance {
  id: string;
  def: ModuleDef;
  /** Parent link; undefined for the root module. */
  attach?: Attachment;
}

export interface Station {
  modules: ModuleInstance[];
  byId: Map<string, ModuleInstance>;
  /** Undirected adjacency between instance ids. */
  links: Map<string, string[]>;
  /** Ports in use, as "moduleId:portId". */
  usedPorts: Set<string>;
}

export interface FreePort {
  moduleId: string;
  portId: string;
}

export function indexDefs(defs: readonly ModuleDef[]): Map<string, ModuleDef> {
  const map = new Map<string, ModuleDef>();
  for (const d of defs) {
    if (map.has(d.id)) throw new Error(`Duplicate module definition "${d.id}"`);
    map.set(d.id, d);
  }
  return map;
}

export function emptyStation(): Station {
  return { modules: [], byId: new Map(), links: new Map(), usedPorts: new Set() };
}

/** The port a module mounts by when it is built: its first port, by convention. */
export function mountPort(def: ModuleDef): string | undefined {
  return def.ports[0]?.id;
}

/**
 * Check that `entry` can join the station, without changing anything. Returns a reason when it can't.
 * The first module is the root and must be unattached; every later module must attach to a free port.
 */
export function attachProblem(station: Station, defs: Map<string, ModuleDef>, entry: LayoutEntry): string | null {
  const def = defs.get(entry.module);
  if (!def) return `"${entry.id}" uses unknown module "${entry.module}"`;
  if (station.byId.has(entry.id)) return `Duplicate module instance id "${entry.id}"`;
  if (!entry.attach) return station.modules.length === 0 ? null : `Only the first module may be unattached; "${entry.id}" has no attachment`;
  if (station.modules.length === 0) return `The first module "${entry.id}" must not be attached to anything`;
  const { to, port, via } = entry.attach;
  const parent = station.byId.get(to);
  if (!parent) return `"${entry.id}" attaches to "${to}", which is not on the station`;
  if (!parent.def.ports.some((p) => p.id === port)) return `"${to}" has no port "${port}"`;
  if (!def.ports.some((p) => p.id === via)) return `"${entry.id}" has no port "${via}"`;
  if (station.usedPorts.has(`${to}:${port}`)) return `Port ${to}:${port} is already in use`;
  return null;
}

/** Add a module to the station. Throws if `attachProblem` would object. */
export function attachModule(station: Station, defs: Map<string, ModuleDef>, entry: LayoutEntry): ModuleInstance {
  const problem = attachProblem(station, defs, entry);
  if (problem) throw new Error(problem);
  const inst: ModuleInstance = { id: entry.id, def: defs.get(entry.module)! };
  if (entry.attach) {
    const { to, port, via } = entry.attach;
    inst.attach = { to, port, via };
    station.usedPorts.add(`${to}:${port}`);
    station.usedPorts.add(`${entry.id}:${via}`);
    station.links.get(to)?.push(entry.id);
    station.links.set(entry.id, [to]);
  } else {
    station.links.set(entry.id, []);
  }
  station.modules.push(inst);
  station.byId.set(entry.id, inst);
  return inst;
}

/** Build and validate a station from a layout. Parents must appear before children. */
export function buildStation(defs: Map<string, ModuleDef>, layout: readonly LayoutEntry[]): Station {
  const station = emptyStation();
  for (const entry of layout) attachModule(station, defs, entry);
  return station;
}

/** Every port on the station with nothing attached to it, in station order. */
export function freePorts(station: Station): FreePort[] {
  const out: FreePort[] = [];
  for (const m of station.modules) {
    for (const p of m.def.ports) if (!station.usedPorts.has(`${m.id}:${p.id}`)) out.push({ moduleId: m.id, portId: p.id });
  }
  return out;
}

/** The next unused instance id for a module definition, like "battery-pack-2". */
export function nextInstanceId(station: Station, defId: string): string {
  let n = 1;
  while (station.byId.has(`${defId}-${n}`)) n++;
  return `${defId}-${n}`;
}
