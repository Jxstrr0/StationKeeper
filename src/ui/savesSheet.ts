// Save and load: the current station (always autosaved), three slots, and a file to carry a station to another device.
import type { Slot, SlotMeta } from '../slots';
import { el, setClass } from './dom';
import { formatDate, money } from './format';

export interface SavesHandlers {
  onSave(slot: number): void;
  onLoad(slot: number): void;
  onDelete(slot: number): void;
  onExport(): void;
  onImport(file: File): void;
  onClose(): void;
}

const CONFIRM_MS = 3500;

/** A button that does its job on the second tap: the first one asks. */
class TwoTap {
  readonly button = el('button', 'warn-act');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private label = '';
  private armedLabel = '';

  constructor(
    private readonly onFire: () => void,
    private readonly extraClass = '',
  ) {
    this.button.type = 'button';
    this.button.addEventListener('click', () => {
      if (this.armedLabel === '' || this.timer !== null) {
        this.disarm();
        this.onFire();
      } else {
        this.button.textContent = this.armedLabel;
        setClass(this.button, 'danger', true);
        this.timer = setTimeout(() => this.disarm(), CONFIRM_MS);
      }
    });
  }

  /** `armedLabel` empty means one tap is enough. */
  set(label: string, armedLabel: string, visible: boolean): void {
    this.label = label;
    this.armedLabel = armedLabel;
    this.button.className = `warn-act ${this.extraClass}`.trim();
    setClass(this.button, 'hidden', !visible);
    this.disarm();
  }

  disarm(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.button.textContent = this.label;
    setClass(this.button, 'danger', false);
  }
}

interface SlotRow {
  thumb: HTMLDivElement;
  name: HTMLElement;
  line: HTMLElement;
  when: HTMLElement;
  save: TwoTap;
  load: TwoTap;
  del: TwoTap;
}

export function slotLines(meta: SlotMeta): { name: string; line: string; when: string } {
  const day = Math.floor(meta.minutes / 1440) + 1;
  const saved = new Date(meta.savedAtMs).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return {
    name: meta.scenarioName,
    line: `Day ${day} · ${formatDate(meta.timeMs)} · ${meta.ended ? 'ended' : money(meta.cash)} · ${meta.modules} modules`,
    when: `Saved ${saved}`,
  };
}

export class SavesSheet {
  readonly root = el('div', 'report-scrim menu-scrim saves-scrim');
  private readonly card = el('section', 'report-sheet menu-sheet saves-sheet');
  private readonly current = el('p', 'saves-current');
  private readonly rows: SlotRow[] = [];
  private readonly file = el('input');
  private readonly exportButton = el('button', 'warn-act', ['Export to a file']);
  private open = false;

  constructor(parent: HTMLElement, handlers: SavesHandlers) {
    const list = el('div', 'saves-list');
    for (let i = 0; i < 3; i++) {
      const row: SlotRow = {
        thumb: el('div', 'saves-thumb'),
        name: el('span', 'saves-name'),
        line: el('span', 'saves-line'),
        when: el('span', 'saves-when'),
        save: new TwoTap(() => handlers.onSave(i)),
        load: new TwoTap(() => handlers.onLoad(i), 'primary'),
        del: new TwoTap(() => handlers.onDelete(i)),
      };
      this.rows.push(row);
      list.append(
        el('article', 'saves-slot', [
          row.thumb,
          el('div', 'saves-info', [
            el('span', 'saves-label', [`Slot ${i + 1}`]),
            row.name,
            row.line,
            row.when,
            el('div', 'saves-actions', [row.load.button, row.save.button, row.del.button]),
          ]),
        ]),
      );
    }

    this.file.type = 'file';
    this.file.accept = 'application/json,.json,text/plain';
    this.file.className = 'hidden';
    this.file.addEventListener('change', () => {
      const f = this.file.files?.[0];
      this.file.value = '';
      if (f) handlers.onImport(f);
    });
    const importButton = el('button', 'warn-act', ['Import a file']);
    importButton.type = 'button';
    importButton.addEventListener('click', () => this.file.click());
    this.exportButton.type = 'button';
    this.exportButton.addEventListener('click', handlers.onExport);
    const done = el('button', 'warn-act primary report-continue', ['Done']);
    done.type = 'button';
    done.addEventListener('click', handlers.onClose);

    this.card.append(
      el('p', 'report-kicker', ['Save and load']),
      el('h2', 'end-title', ['Stations']),
      this.current,
      list,
      el('div', 'saves-files', [this.exportButton, importButton, this.file]),
      done,
    );
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-modal', 'true');
    this.card.setAttribute('aria-label', 'Save and load');
    this.root.append(this.card);
    this.root.setAttribute('aria-hidden', 'true');
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) handlers.onClose();
    });
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /**
   * `current` describes the station in play, or null when there isn't one to save (a fresh title screen).
   * Saving is offered only when there is.
   */
  show(current: string | null, slots: readonly Slot[]): void {
    this.update(current, slots);
    this.open = true;
    setClass(this.root, 'open', true);
    this.root.setAttribute('aria-hidden', 'false');
  }

  update(current: string | null, slots: readonly Slot[]): void {
    this.current.textContent = current
      ? `This station is saved as you play: ${current}. Keep a copy in a slot to come back to later.`
      : 'Load a station from a slot or a file, or start one from the title screen.';
    setClass(this.exportButton, 'hidden', current === null);
    const canSave = current !== null;
    slots.forEach((slot, i) => {
      const row = this.rows[i];
      if (!row) return;
      const meta = slot.kind === 'ok' ? slot.file.meta : slot.kind === 'stale' ? slot.meta : null;
      const lines = meta ? slotLines(meta) : null;
      row.name.textContent = lines?.name ?? (slot.kind === 'stale' ? 'Unreadable save' : 'Empty');
      row.line.textContent = slot.kind === 'stale' ? 'From another version of the game; it no longer loads.' : (lines?.line ?? '');
      row.when.textContent = lines?.when ?? '';
      setClass(row.name, 'empty', slot.kind === 'empty');
      row.thumb.style.backgroundImage = meta?.thumb ? `url("${meta.thumb}")` : '';
      setClass(row.thumb, 'blank', !meta?.thumb);
      row.load.set('Load', canSave ? 'Tap to load' : '', slot.kind === 'ok');
      row.save.set(slot.kind === 'empty' ? 'Save here' : 'Overwrite', slot.kind === 'empty' ? '' : 'Tap to overwrite', canSave);
      row.del.set('Delete', 'Tap to delete', slot.kind !== 'empty');
    });
  }

  close(): void {
    for (const r of this.rows) {
      r.load.disarm();
      r.save.disarm();
      r.del.disarm();
    }
    this.open = false;
    setClass(this.root, 'open', false);
    this.root.setAttribute('aria-hidden', 'true');
  }
}
