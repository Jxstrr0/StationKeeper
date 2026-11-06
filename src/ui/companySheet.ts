// The company: every station it owns, what's for sale, new launches, and the milestones so far.
// Flying to another station reloads into it; buying and launching take two taps, since they spend real money.
import type { CompanyView } from '../company/view';
import { el, setClass } from './dom';
import { money } from './format';
import { TwoTap } from './savesSheet';

export interface CompanyHandlers {
  onFly(stationId: string): void;
  onBuy(listingId: string): void;
  onFound(optionId: string): void;
  onWindUp(): void;
  onClose(): void;
}

export class CompanySheet {
  readonly root = el('div', 'report-scrim menu-scrim saves-scrim company-scrim');
  private readonly card = el('section', 'report-sheet menu-sheet saves-sheet company-sheet');
  private readonly title = el('h2', 'end-title');
  private readonly figures = el('div', 'company-figures');
  private readonly stations = el('div', 'saves-list');
  private readonly listings = el('div', 'saves-list');
  private readonly found = el('div', 'saves-list');
  private readonly milestones = el('ul', 'company-milestones');
  private readonly lost = el('p', 'saves-current');
  private readonly windUp: TwoTap;
  private open = false;
  /** Rebuilt only when what's listed changes, so a two-tap in progress survives the regular refresh. */
  private key = '';

  constructor(parent: HTMLElement, private readonly handlers: CompanyHandlers) {
    this.windUp = new TwoTap(() => handlers.onWindUp());
    this.windUp.set('Wind up the company and start again', 'Tap again: every station goes', true);
    const done = el('button', 'warn-act primary report-continue', ['Done']);
    done.type = 'button';
    done.addEventListener('click', handlers.onClose);
    const h = (text: string, line?: string) => [el('h3', 'company-h', [text]), ...(line ? [el('p', 'saves-current', [line])] : [])];
    this.card.append(
      el('p', 'report-kicker', ['Company']),
      this.title,
      this.figures,
      ...h('Stations', 'One station is run hands-on at a time. A deputy keeps the others going, a little less well.'),
      this.stations,
      ...h('For sale', 'Run-down stations, cheap. They come and go.'),
      this.listings,
      ...h('Found a station', 'A new core, solar array, battery, habitat, life support and radiator, launched together.'),
      this.found,
      ...h('Milestones'),
      this.milestones,
      this.lost,
      el('div', 'company-end', [this.windUp.button]),
      done,
    );
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-modal', 'true');
    this.card.setAttribute('aria-label', 'Company');
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

  show(v: CompanyView): void {
    this.key = '';
    this.update(v);
    this.open = true;
    setClass(this.root, 'open', true);
    this.root.setAttribute('aria-hidden', 'false');
  }

  update(v: CompanyView): void {
    this.title.textContent = v.name;
    const fig = (label: string, value: string, cls = '') => el('div', 'company-fig', [el('span', '', [label]), el('b', cls, [value])]);
    this.figures.replaceChildren(
      fig('Cash', money(v.cash), v.cash < 0 ? 'neg' : ''),
      fig('Worth', money(v.value)),
      fig('Per day', money(v.perDay), v.perDay < 0 ? 'neg' : 'pos'),
      fig('Day', String(v.day)),
    );
    // Affordability is part of the key: a button that becomes affordable needs its state refreshed.
    const key = JSON.stringify([v.stations, v.listings.map((l) => [l.id, l.affordable, l.left]), v.found.map((f) => f.affordable), v.milestones, v.lost]);
    if (key === this.key) return;
    this.key = key;

    this.stations.replaceChildren(
      ...v.stations.map((s) => {
        const actions = el('div', 'saves-actions');
        if (!s.here) {
          const fly = el('button', 'warn-act primary', ['Fly there']);
          fly.type = 'button';
          fly.addEventListener('click', () => this.handlers.onFly(s.id));
          actions.append(fly);
        }
        return el('article', `saves-slot company-row${s.here ? ' here' : ''}`, [
          el('div', 'saves-info', [el('span', 'saves-name', [s.name]), el('span', 'saves-line', [s.line]), el('span', 'saves-when', [s.note]), actions]),
        ]);
      }),
    );

    this.listings.replaceChildren(
      ...(v.listings.length === 0
        ? [el('p', 'saves-current', ['Nothing for sale just now. Check back in a day or two.'])]
        : v.listings.map((l) => {
            const buy = new TwoTap(() => this.handlers.onBuy(l.id), 'primary');
            buy.set(`Buy for ${money(l.price)}`, 'Tap again to buy', true);
            buy.button.disabled = !l.affordable;
            return el('article', 'saves-slot company-row', [
              el('div', 'saves-info', [el('span', 'saves-name', [l.name]), el('span', 'saves-line', [l.line]), el('span', 'saves-when', [l.left]), el('div', 'saves-actions', [buy.button])]),
            ]);
          })),
    );

    this.found.replaceChildren(
      ...v.found.map((f) => {
        const go = new TwoTap(() => this.handlers.onFound(f.id), 'primary');
        go.set(`Launch for ${money(f.price)}`, 'Tap again to launch', true);
        go.button.disabled = !f.affordable;
        return el('article', 'saves-slot company-row', [el('div', 'saves-info', [el('span', 'saves-name', [f.label]), el('span', 'saves-line', [f.line]), el('div', 'saves-actions', [go.button])])]);
      }),
    );

    this.milestones.replaceChildren(...v.milestones.map((m) => el('li', m.done ? 'done' : '', [m.label])));
    this.lost.textContent = v.lost.length ? `Lost along the way: ${v.lost.join('; ')}.` : '';
    setClass(this.lost, 'hidden', v.lost.length === 0);
  }

  close(): void {
    this.windUp.disarm();
    this.open = false;
    setClass(this.root, 'open', false);
    this.root.setAttribute('aria-hidden', 'true');
  }
}
