import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, Simulation } from '../src/sim/simulation';
import { makeSlotFile, parseImport, parseSlotFile, type SlotMeta } from '../src/slots';
import { baseScenario, defs } from './helpers';

const meta: SlotMeta = {
  scenarioId: baseScenario.id,
  scenarioName: baseScenario.name,
  timeMs: 0,
  minutes: 120,
  cash: 40,
  modules: 3,
  ended: false,
  savedAtMs: 1,
  thumb: null,
};

function savedSim(): Simulation {
  const sim = new Simulation(defs, structuredClone(baseScenario));
  sim.run(120);
  return sim;
}

describe('save slots', () => {
  it('reads back what it wrote', () => {
    const file = makeSlotFile(meta, savedSim().save());
    const slot = parseSlotFile(JSON.stringify(file), SAVE_VERSION);
    expect(slot.kind).toBe('ok');
    if (slot.kind === 'ok') expect(slot.file).toEqual(JSON.parse(JSON.stringify(file)));
  });

  it('tells an empty slot from one it can no longer load, and keeps the stale one’s description', () => {
    expect(parseSlotFile(null, SAVE_VERSION)).toEqual({ kind: 'empty' });
    expect(parseSlotFile('{oops', SAVE_VERSION)).toEqual({ kind: 'stale', meta: null });
    const old = makeSlotFile(meta, { ...savedSim().save(), version: SAVE_VERSION - 1 } as unknown as ReturnType<Simulation['save']>);
    expect(parseSlotFile(JSON.stringify(old), SAVE_VERSION)).toEqual({ kind: 'stale', meta });
  });

  it('imports an exported file or a bare autosave, and refuses anything else with a reason', () => {
    const save = savedSim().save();
    const fromFile = parseImport(JSON.stringify(makeSlotFile(meta, save)), SAVE_VERSION);
    const bare = parseImport(JSON.stringify(save), SAVE_VERSION);
    expect(fromFile.ok && bare.ok).toBe(true);
    if (fromFile.ok && bare.ok) expect(fromFile.save).toEqual(bare.save);
    const loaded = bare.ok ? Simulation.fromSave(defs, baseScenario, bare.save) : null;
    expect(loaded?.snapshot().minutes).toBe(120);

    expect(parseImport('a picture of a cat', SAVE_VERSION)).toEqual({ ok: false, reason: expect.stringContaining("isn't a Station Keeper save") });
    expect(parseImport('{"hello":1}', SAVE_VERSION).ok).toBe(false);
    expect(parseImport(JSON.stringify({ ...save, version: 1 }), SAVE_VERSION)).toEqual({ ok: false, reason: expect.stringContaining('another version') });
  });
});
