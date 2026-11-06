// The pause menu: everything that isn't running the station. Opening it stops the clock; Resume puts it back.
import { el, setClass } from './dom';

export interface PauseMenuHandlers {
  onResume(): void;
  onSaves(): void;
  onRestart(): void;
  onSettings(): void;
  onHelp(): void;
  onPhoto(): void;
  onQuit(): void;
}

const CONFIRM_MS = 3500;

export class PauseMenu {
  readonly root = el('div', 'report-scrim menu-scrim');
  private readonly card = el('section', 'report-sheet menu-sheet');
  private readonly sub = el('p', 'menu-sub');
  /** Where a quiet note (the backup reminder) sits, above the menu. */
  readonly notice = el('div', 'menu-notice');
  private readonly restart = el('button', 'menu-item');
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private open = false;

  constructor(parent: HTMLElement, handlers: PauseMenuHandlers) {
    const item = (label: string, onClick: () => void, extra = '') => {
      const b = el('button', `menu-item ${extra}`.trim(), [label]);
      b.type = 'button';
      b.addEventListener('click', onClick);
      return b;
    };
    this.restart.type = 'button';
    this.armRestart(false);
    // Restarting throws the station away, so it takes a second tap.
    this.restart.addEventListener('click', () => {
      if (this.restartTimer === null) {
        this.armRestart(true);
        this.restartTimer = setTimeout(() => this.armRestart(false), CONFIRM_MS);
      } else {
        this.armRestart(false);
        handlers.onRestart();
      }
    });
    this.card.append(
      el('p', 'report-kicker', ['Paused']),
      el('h2', 'end-title', ['Station Keeper']),
      this.sub,
      this.notice,
      el('div', 'menu-list', [
        item('Resume', handlers.onResume, 'primary'),
        item('Save and load', handlers.onSaves),
        this.restart,
        item('Settings', handlers.onSettings),
        item('How to play', handlers.onHelp),
        item('Photo mode', handlers.onPhoto),
        item('Quit to title', handlers.onQuit),
      ]),
    );
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-modal', 'true');
    this.card.setAttribute('aria-label', 'Pause menu');
    this.root.append(this.card);
    this.root.setAttribute('aria-hidden', 'true');
    // A tap on the dimmed backdrop resumes, like Escape.
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) handlers.onResume();
    });
    parent.append(this.root);
  }

  private armRestart(armed: boolean): void {
    if (this.restartTimer !== null) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.restart.textContent = armed ? 'Tap again to restart' : 'Restart this posting';
    setClass(this.restart, 'danger', armed);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** `line` says which posting this is and how far in, under the title. */
  show(line: string): void {
    this.sub.textContent = line;
    this.armRestart(false);
    this.open = true;
    setClass(this.root, 'open', true);
    this.root.setAttribute('aria-hidden', 'false');
  }

  close(): void {
    this.armRestart(false);
    this.open = false;
    setClass(this.root, 'open', false);
    this.root.setAttribute('aria-hidden', 'true');
  }
}
