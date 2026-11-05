// The station as a graph of module instances joined at ports.
import type { LayoutEntry, ModuleDef } from './types';

export interface ModuleInstance {
  id: string;
  def: ModuleDef;
  /** Parent link; undefined for the root module. */
  attach?: { to: string; port: string; via: string };
}

export interface Station {
  modules: ModuleInstance[];
  byId: Map<string, ModuleInstance>;
  /** Undirected adjacency between instance ids. */
  links: Map<string, string[]>;
}

export function indexDefs(defs: readonly ModuleDef[]): Map<string, ModuleDef> {
  const map = new Map<string, ModuleDef>();
  for (const d of defs) {
    if (map.has(d.id)) throw new Error(`Duplicate module definition "${d.id}"`);
    map.set(d.id, d);
  }
  return map;
}

/** Build and validate a station from a layout. Parents must appear before children. */
export function buildStation(defs: Map<string, ModuleDef>, layout: readonly LayoutEntry[]): Station {
  const modules: ModuleInstance[] = [];
  const byId = new Map<string, ModuleInstance>();
  const links = new Map<string, string[]>();
  const usedPorts = new Set<string>();

  layout.forEach((entry, i) => {
    const def = defs.get(entry.module);
    if (!def) throw new Error(`Layout entry "${entry.id}" uses unknown module "${entry.module}"`);
    if (byId.has(entry.id)) throw new Error(`Duplicate module instance id "${entry.id}"`);

    const inst: ModuleInstance = { id: entry.id, def };
    if (entry.attach) {
      const { to, port, via } = entry.attach;
      const parent = byId.get(to);
      if (!parent) throw new Error(`"${entry.id}" attaches to "${to}", which is not placed before it`);
      if (!parent.def.ports.some((p) => p.id === port)) throw new Error(`"${to}" has no port "${port}"`);
      if (!def.ports.some((p) => p.id === via)) throw new Error(`"${entry.id}" has no port "${via}"`);
      const parentKey = `${to}:${port}`;
      const childKey = `${entry.id}:${via}`;
      if (usedPorts.has(parentKey)) throw new Error(`Port ${parentKey} is already in use`);
      usedPorts.add(parentKey);
      usedPorts.add(childKey);
      inst.attach = { to, port, via };
      links.get(to)?.push(entry.id);
      links.set(entry.id, [to]);
    } else {
      if (i !== 0) throw new Error(`Only the first module may be unattached; "${entry.id}" has no attachment`);
      links.set(entry.id, []);
    }
    modules.push(inst);
    byId.set(entry.id, inst);
  });

  return { modules, byId, links };
}
