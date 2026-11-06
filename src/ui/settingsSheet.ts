// Settings: graphics, motion, UI size, the clock, and sound. Each change applies at once and is remembered.
import type { Quality, Settings, UiSize } from '../settings';
import { el, setClass } from './dom';

interface Choice<T> {
  value: T;
  label: string;
}

export class SettingsSheet {
  readonly root = el('div', 'report-scrim menu-scrim settings-scrim');
  private readonly card = el('section', 'report-sheet menu-sheet settings-sheet');
  private open = false;
  private current: Settings;
  private readonly refreshers: (() => void)[] = [];

  constructor(
    parent: HTMLElement,
    initial: Settings,
    private readonly onChange: (s: Settings) => void,
    private readonly onClose: () => void,
    onGuide?: () => void,
  ) {
    this.current = { ...initial };
    const done = el('button', 'warn-act primary report-continue', ['Done']);
    done.type = 'button';
    done.addEventListener('click', () => this.onClose());

    const volume = el('input', 'set-range');
    volume.type = 'range';
    volume.min = '0';
    volume.max = '100';
    volume.step = '5';
    volume.setAttribute('aria-label', 'Volume');
    volume.addEventListener('input', () => this.set({ volume: Number(volume.value) / 100 }));
    this.refreshers.push(() => {
      volume.value = String(Math.round(this.current.volume * 100));
      volume.disabled = this.current.muted;
    });

    this.card.append(
      el('p', 'report-kicker', ['Settings']),
      el('h2', 'end-title', ['Preferences']),
      el('div', 'set-list', [
        this.row(
          'Graphics',
          'Auto drops the resolution when frames are slow.',
          this.segment<Quality>(
            'Graphics',
            [
              { value: 'low', label: 'Low' },
              { value: 'auto', label: 'Auto' },
              { value: 'high', label: 'High' },
            ],
            () => this.current.quality,
            (quality) => this.set({ quality }),
          ),
        ),
        this.row(
          'Interface size',
          null,
          this.segment<UiSize>(
            'Interface size',
            [
              { value: 'small', label: 'Small' },
              { value: 'normal', label: 'Normal' },
              { value: 'large', label: 'Large' },
            ],
            () => this.current.uiSize,
            (uiSize) => this.set({ uiSize }),
          ),
        ),
        this.row(
          'Clock',
          null,
          this.segment<boolean>(
            'Clock',
            [
              { value: true, label: '24 h' },
              { value: false, label: '12 h' },
            ],
            () => this.current.clock24,
            (clock24) => this.set({ clock24 }),
          ),
        ),
        this.row(
          'Reduce motion',
          'No camera drift or fling, no sliding panels.',
          this.segment<boolean>(
            'Reduce motion',
            [
              { value: false, label: 'Off' },
              { value: true, label: 'On' },
            ],
            () => this.current.reducedMotion,
            (reducedMotion) => this.set({ reducedMotion }),
          ),
        ),
        this.row(
          'Sound',
          null,
          el('div', 'set-sound', [
            this.segment<boolean>(
              'Sound',
              [
                { value: false, label: 'On' },
                { value: true, label: 'Off' },
              ],
              () => this.current.muted,
              (muted) => this.set({ muted }),
            ),
            volume,
          ]),
        ),
        ...(onGuide ? [this.row('Getting started', 'The short guide from the first posting.', this.guideButton(onGuide))] : []),
      ]),
      done,
    );
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-modal', 'true');
    this.card.setAttribute('aria-label', 'Settings');
    this.root.append(this.card);
    this.root.setAttribute('aria-hidden', 'true');
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.onClose();
    });
    parent.append(this.root);
    this.refresh();
  }

  private guideButton(onGuide: () => void): HTMLElement {
    const b = el('button', 'warn-act', ['Show the guide again']);
    b.type = 'button';
    b.addEventListener('click', onGuide);
    return b;
  }

  private row(label: string, hint: string | null, control: HTMLElement): HTMLElement {
    return el('div', 'set-row', [
      el('div', 'set-label', [el('span', 'set-name', [label]), ...(hint ? [el('span', 'set-hint', [hint])] : [])]),
      control,
    ]);
  }

  private segment<T>(label: string, choices: Choice<T>[], get: () => T, pick: (v: T) => void): HTMLElement {
    const group = el('div', 'segment');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', label);
    const buttons = choices.map((c) => {
      const b = el('button', 'segment-btn', [c.label]);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => pick(c.value));
      group.append(b);
      return b;
    });
    this.refreshers.push(() =>
      choices.forEach((c, i) => {
        const on = get() === c.value;
        setClass(buttons[i]!, 'active', on);
        buttons[i]!.setAttribute('aria-checked', String(on));
      }),
    );
    return group;
  }

  private set(patch: Partial<Settings>): void {
    this.current = { ...this.current, ...patch };
    this.refresh();
    this.onChange({ ...this.current });
  }

  private refresh(): void {
    for (const r of this.refreshers) r();
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(): void {
    this.open = true;
    setClass(this.root, 'open', true);
    this.root.setAttribute('aria-hidden', 'false');
  }

  close(): void {
    this.open = false;
    setClass(this.root, 'open', false);
    this.root.setAttribute('aria-hidden', 'true');
  }
}
