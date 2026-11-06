// Save and load: the current station (always autosaved), three slots, a file to carry a station to another device,
// and a backup of the whole game (a code or a text file) in case the browser clears its storage.
import type { Slot, SlotMeta } from '../slots';
import { el, setClass } from './dom';
import { formatDate, money } from './format';

export interface SavesHandlers {
  onSave(slot: number): void;
  onLoad(slot: number): void;
  onDelete(slot: number): void;
  onExport(): void;
  onImport(file: File): void;
  /** Copy the backup code. Resolves to the code if it couldn't reach the clipboard, so it can be shown to copy by hand. */
  onCopyCode(): Promise<string | null>;
  /** The player copied the code by hand from the box. */
  onCopiedByHand(): void;
  onSaveBackupFile(): void;
  /** A code or a file's text, checked: what it holds, or why it can't be used. */
  onCheckCode(text: string): { ok: true; summary: string } | { ok: false; reason: string };
  onRestore(text: string): void;
  onClose(): void;
}

const CONFIRM_MS = 3500;

/** A button that does its job on the second tap: the first one asks. */
export class TwoTap {
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
  private readonly storageLine = el('p', 'saves-backup-line saves-storage hidden');
  private readonly lastLine = el('p', 'saves-backup-line');
  private readonly backupFile = el('input');
  private readonly codePanel = el('div', 'saves-code hidden');
  private readonly codeBox = el('textarea', 'saves-code-box');
  private readonly codeNote = el('p', 'saves-code-note');
  private readonly restore: TwoTap;
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
    // ---- Backup: the whole game as a code or a small text file ----
    const button = (label: string, onClick: () => void) => {
      const b = el('button', 'warn-act', [label]);
      b.type = 'button';
      b.addEventListener('click', onClick);
      return b;
    };
    this.backupFile.type = 'file';
    this.backupFile.accept = '.txt,text/plain';
    this.backupFile.className = 'hidden';
    this.backupFile.addEventListener('change', () => {
      const f = this.backupFile.files?.[0];
      this.backupFile.value = '';
      if (!f) return;
      f.text()
        .then((text) => this.openRestore(text.trim()))
        .catch(() => this.openRestore(''))
        .finally(() => {
          if (this.codeBox.value === '') this.setNote("That file couldn't be read.", true);
        });
    });
    this.codeBox.rows = 3;
    this.codeBox.spellcheck = false;
    this.codeBox.autocomplete = 'off';
    this.codeBox.setAttribute('autocapitalize', 'off');
    this.codeBox.setAttribute('aria-label', 'Backup code');
    this.codeBox.addEventListener('input', () => this.check());
    this.codeBox.addEventListener('copy', () => {
      if (this.codeBox.readOnly) handlers.onCopiedByHand();
    });
    this.restore = new TwoTap(() => handlers.onRestore(this.codeBox.value), 'primary');
    const cancel = button('Cancel', () => this.closeCode());
    this.codePanel.append(this.codeBox, this.codeNote, el('div', 'saves-code-actions', [this.restore.button, cancel]));
    const copy = button('Copy backup code', () => {
      void handlers.onCopyCode().then((code) => {
        if (code !== null) this.showCodeToCopy(code);
      });
    });
    this.backupFileButton = button('Save backup file', handlers.onSaveBackupFile);
    this.copyButton = copy;
    const backup = el('div', 'saves-backup', [
      el('p', 'saves-backup-title', ['Backup']),
      el('p', 'saves-backup-line', ['Every station, slot and setting on this device, as a code or a small file. Keep one somewhere safe.']),
      this.storageLine,
      this.lastLine,
      el('div', 'saves-files', [
        copy,
        this.backupFileButton,
        button('Restore from code', () => this.openRestore('')),
        button('Load backup file', () => this.backupFile.click()),
        this.backupFile,
      ]),
      this.codePanel,
    ]);
    this.checkCode = handlers.onCheckCode;

    const done = el('button', 'warn-act primary report-continue', ['Done']);
    done.type = 'button';
    done.addEventListener('click', handlers.onClose);

    this.card.append(
      el('p', 'report-kicker', ['Save and load']),
      el('h2', 'end-title', ['Stations']),
      this.current,
      list,
      el('div', 'saves-files', [this.exportButton, importButton, this.file]),
      backup,
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

  private readonly checkCode: SavesHandlers['onCheckCode'];
  private readonly copyButton: HTMLButtonElement;
  private readonly backupFileButton: HTMLButtonElement;

  get isOpen(): boolean {
    return this.open;
  }

  /**
   * The storage line (null hides it: the browser can't say), when the last backup was made, and whether there's
   * anything to back up yet.
   */
  setBackupStatus(storage: string | null, last: string, canBackUp: boolean): void {
    this.copyButton.disabled = !canBackUp;
    this.backupFileButton.disabled = !canBackUp;
    this.storageLine.textContent = storage ?? '';
    setClass(this.storageLine, 'hidden', storage === null);
    this.lastLine.textContent = last;
  }

  /** The restore box, empty for a paste or filled from a backup file, checked straight away. */
  openRestore(text: string): void {
    this.codeBox.readOnly = false;
    this.codeBox.value = text;
    this.codeBox.placeholder = 'Paste a backup code here. It starts with SK1:';
    setClass(this.restore.button, 'hidden', false);
    setClass(this.codePanel, 'hidden', false);
    this.check();
    this.codePanel.scrollIntoView({ block: 'nearest' });
    if (text === '') this.codeBox.focus();
  }

  /** The clipboard wasn't available: show the code to select and copy by hand. */
  private showCodeToCopy(code: string): void {
    this.codeBox.readOnly = true;
    this.codeBox.value = code;
    setClass(this.restore.button, 'hidden', true);
    setClass(this.codePanel, 'hidden', false);
    this.codePanel.scrollIntoView({ block: 'nearest' });
    this.setNote('Copy this code and keep it somewhere safe, like a note or an email to yourself.', false);
    this.codeBox.focus();
    this.codeBox.select();
  }

  /** Shows a problem with the code under the box, e.g. when a restore is refused. */
  restoreFailed(reason: string): void {
    this.setNote(reason, true);
  }

  private closeCode(): void {
    this.restore.disarm();
    this.codeBox.value = '';
    setClass(this.codePanel, 'hidden', true);
  }

  private setNote(text: string, bad: boolean): void {
    this.codeNote.textContent = text;
    setClass(this.codeNote, 'bad', bad);
  }

  private check(): void {
    if (this.codeBox.readOnly) return;
    const text = this.codeBox.value.trim();
    if (text === '') {
      this.restore.set('Restore', '', false);
      this.setNote('Restoring replaces every station on this device with the backup.', false);
      return;
    }
    const result = this.checkCode(text);
    this.restore.set('Restore', 'Tap to replace everything', result.ok);
    this.setNote(result.ok ? result.summary : `${result.reason}.`, !result.ok);
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
    this.closeCode();
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
