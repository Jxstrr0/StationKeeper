import { describe, expect, it } from 'vitest';
import { GAME_VERSION } from '../src/version';

describe('game version', () => {
  it('has four numbers: Major.Minor.Patch.Build', () => {
    expect(GAME_VERSION).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });
});
