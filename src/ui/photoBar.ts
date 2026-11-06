// Photo mode: the UI steps aside except for a shutter and a way out. The camera works as usual.
import { el, setClass } from './dom';

const SHUTTER_ICON =
  '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M8.5 5.5 10 3.5h4l1.5 2H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12.5" r="3.8" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const CLOSE_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

export class PhotoBar {
  readonly root = el('div', 'photo-bar');
  private readonly flash = el('div', 'photo-flash');
  private readonly hint = el('p', 'photo-hint', ['Drag to turn, pinch to zoom. The shutter saves a picture.']);
  private open = false;

  constructor(parent: HTMLElement, onShutter: () => void, onExit: () => void) {
    const shutter = el('button', 'photo-shutter');
    shutter.type = 'button';
    shutter.innerHTML = SHUTTER_ICON;
    shutter.setAttribute('aria-label', 'Take a picture');
    shutter.addEventListener('click', onShutter);
    const exit = el('button', 'photo-exit');
    exit.type = 'button';
    exit.innerHTML = CLOSE_ICON;
    exit.setAttribute('aria-label', 'Leave photo mode');
    exit.addEventListener('click', onExit);
    this.root.append(this.flash, this.hint, exit, shutter);
    this.root.setAttribute('aria-hidden', 'true');
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(): void {
    this.open = true;
    setClass(this.root, 'open', true);
    setClass(this.hint, 'gone', false);
    this.root.setAttribute('aria-hidden', 'false');
    // The hint gets out of the shot after a few seconds.
    setTimeout(() => setClass(this.hint, 'gone', true), 3500);
  }

  hide(): void {
    this.open = false;
    setClass(this.root, 'open', false);
    this.root.setAttribute('aria-hidden', 'true');
  }

  /** A white blink so the player knows the picture was taken. */
  blink(): void {
    setClass(this.flash, 'on', false);
    void this.flash.offsetWidth; // restart the animation
    setClass(this.flash, 'on', true);
  }
}
