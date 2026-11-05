import { describe, expect, it } from 'vitest';
import { buildStation, indexDefs } from '../src/sim/station';
import { defs } from './helpers';

const byId = indexDefs(defs);

describe('station graph', () => {
  it('builds the starter station', () => {
    const st = buildStation(byId, [
      { id: 'core', module: 'core' },
      { id: 'hab', module: 'habitat', attach: { to: 'core', port: 'fore', via: 'aft' } },
    ]);
    expect(st.links.get('core')).toEqual(['hab']);
    expect(st.links.get('hab')).toEqual(['core']);
  });

  it('rejects unknown ports and double-used ports', () => {
    expect(() =>
      buildStation(byId, [
        { id: 'core', module: 'core' },
        { id: 'hab', module: 'habitat', attach: { to: 'core', port: 'nope', via: 'aft' } },
      ]),
    ).toThrow(/no port/);
    expect(() =>
      buildStation(byId, [
        { id: 'core', module: 'core' },
        { id: 'a', module: 'habitat', attach: { to: 'core', port: 'fore', via: 'aft' } },
        { id: 'b', module: 'habitat', attach: { to: 'core', port: 'fore', via: 'aft' } },
      ]),
    ).toThrow(/already in use/);
  });

  it('rejects a second root', () => {
    expect(() => buildStation(byId, [{ id: 'a', module: 'core' }, { id: 'b', module: 'core' }])).toThrow();
  });
});
