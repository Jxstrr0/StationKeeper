import { describe, expect, it } from 'vitest';
import { defaultSettings, parseSettings } from '../src/settings';
import { formatTime } from '../src/ui/format';

describe('settings', () => {
  it('falls back to the defaults for nothing stored or junk', () => {
    expect(parseSettings(null)).toEqual(defaultSettings());
    expect(parseSettings('not json')).toEqual(defaultSettings());
    expect(parseSettings('42')).toEqual(defaultSettings());
  });

  it('keeps good values and replaces bad ones field by field', () => {
    const s = parseSettings(JSON.stringify({ quality: 'high', uiSize: 'huge', clock24: false, volume: 3, muted: 'yes', extra: 1 }));
    expect(s).toEqual({ ...defaultSettings(), quality: 'high', clock24: false, volume: 1 });
  });

  it('uses the given fallback, so a reduced-motion system preference is the default', () => {
    expect(parseSettings(null, defaultSettings(true)).reducedMotion).toBe(true);
    expect(parseSettings('{"reducedMotion":false}', defaultSettings(true)).reducedMotion).toBe(false);
  });
});

describe('clock format', () => {
  const at = (h: number, m: number) => Date.UTC(2041, 5, 14, h, m);
  it('shows 24-hour time by default and 12-hour on request', () => {
    expect(formatTime(at(6, 1))).toBe('06:01');
    expect(formatTime(at(0, 5), false)).toBe('12:05 am');
    expect(formatTime(at(12, 0), false)).toBe('12:00 pm');
    expect(formatTime(at(18, 45), false)).toBe('6:45 pm');
  });
});
