// A quiet note suggesting a backup, shown at most once a visit, only on the title screen or the pause menu.
// It never blocks anything: Back up opens Save and load, Not now just hides it.
import { el, setClass } from './dom';

export class BackupNudge {
  readonly root = el('div', 'backup-nudge hidden');
  private readonly text = el('p', 'backup-nudge-text');

  /** `onResize` is told when the note appears or goes, so the view can make room for it. */
  constructor(
    onBackUp: () => void,
    private readonly onResize: () => void = () => undefined,
  ) {
    const later = el('button', 'warn-act', ['Not now']);
    later.type = 'button';
    later.addEventListener('click', () => this.hide());
    const go = el('button', 'warn-act primary', ['Back up']);
    go.type = 'button';
    go.addEventListener('click', () => {
      this.hide();
      onBackUp();
    });
    this.root.setAttribute('role', 'status');
    this.root.append(this.text, el('div', 'backup-nudge-actions', [go, later]));
  }

  /** Show the note inside `container` (the title's or the pause menu's notice spot). */
  show(container: HTMLElement, text: string): void {
    this.text.textContent = text;
    container.append(this.root);
    setClass(this.root, 'hidden', false);
    this.onResize();
  }

  hide(): void {
    if (!this.root.isConnected) return;
    setClass(this.root, 'hidden', true);
    this.root.remove(); // leaves the notice spot empty, so it takes no room
    this.onResize();
  }
}
