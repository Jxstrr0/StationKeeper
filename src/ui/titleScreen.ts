// The title screen, laid over the station itself turning slowly in orbit. The HUD stays hidden until the player carries on.
import { el, setClass } from './dom';

export interface TitleHandlers {
  /** Carry on with the station behind the title. */
  onContinue(): void;
  onNewStation(): void;
  onLoad(): void;
  onHelp(): void;
  onSettings(): void;
}

export class TitleScreen {
  readonly root = el('div', 'title-screen');
  /** The wordmark block and the button block: the view centres the station in the gap between them. */
  readonly head = el('div', 'title-head');
  readonly foot = el('div', 'title-foot');
  private readonly cont = el('button', 'title-btn primary');
  private readonly contLine = el('span', 'title-btn-sub');
  private readonly fresh = el('button', 'title-btn');
  private open = false;

  constructor(parent: HTMLElement, handlers: TitleHandlers) {
    const btn = (label: string, onClick: () => void) => {
      const b = el('button', 'title-btn', [label]);
      b.type = 'button';
      b.addEventListener('click', onClick);
      return b;
    };
    this.cont.type = 'button';
    this.cont.append(el('span', 'title-btn-main', ['Continue']), this.contLine);
    this.cont.addEventListener('click', handlers.onContinue);
    this.fresh.type = 'button';
    this.fresh.textContent = 'New station';
    this.fresh.addEventListener('click', handlers.onNewStation);

    this.head.append(
      el('p', 'title-kicker', ['A Longlight Interactive game']),
      el('h1', 'title-mark', ['Station', el('br'), 'Keeper']),
      el('p', 'title-tag', ['Keep the lights on, 400 km up.']),
    );
    this.foot.append(
      this.cont,
      this.fresh,
      el('div', 'title-row', [btn('Load', handlers.onLoad), btn('How to play', handlers.onHelp), btn('Settings', handlers.onSettings)]),
    );
    this.root.append(this.head, this.foot);
    this.root.setAttribute('aria-hidden', 'true');
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /**
   * `resume` describes the station behind the title when there's one worth carrying on with; otherwise
   * New station leads and Continue starts the fresh station on show.
   */
  show(resume: string | null): void {
    this.contLine.textContent = resume ?? 'The first posting, ready to go';
    setClass(this.contLine, 'hidden', false);
    (this.cont.firstChild as HTMLElement).textContent = resume ? 'Continue' : 'Start';
    this.open = true;
    setClass(this.root, 'open', true);
    this.root.setAttribute('aria-hidden', 'false');
  }

  hide(): void {
    this.open = false;
    setClass(this.root, 'open', false);
    this.root.setAttribute('aria-hidden', 'true');
  }
}
