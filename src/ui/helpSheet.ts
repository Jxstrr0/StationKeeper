// "How to play": a few short illustrated pages on how the station works, stepped with Back and Next, the arrow keys,
// the dots, or a sideways swipe. main.ts owns Escape (it calls close(), then its own onClose).
import { el, setClass, setText } from './dom';

export interface HelpPage {
  title: string;
  /** Inline SVG markup: static and hand-written here, never built from player input. */
  art: string;
  /** Paragraphs. `*words*` are UI labels, shown in bold so they're easy to find on screen. */
  text: readonly string[];
}

/** A sideways drag at least this long, and mostly sideways, turns the page. */
const SWIPE_PX = 50;

// Flat line art on a 240×120 canvas. Strokes default to currentColor (muted); `ha-*` classes in help.css pick token colours.
const svg = (body: string) => `<svg viewBox="0 0 240 120" aria-hidden="true" focusable="false">${body}</svg>`;

/** A five-point star of radius 8 around (x, y). */
const star = (x: number, y: number, cls: string) =>
  `<path class="${cls}" transform="translate(${x} ${y})" d="M0-8L2-2.8 7.6-2.5 3.2 1 4.7 6.5 0 3.4-4.7 6.5-3.2 1-7.6-2.5-2-2.8Z"/>`;

const person = (x: number, cls: string) => `<circle class="${cls}" cx="${x}" cy="40" r="9"/><path class="${cls}" d="M${x - 17} 84c0-13 8-20 17-20s17 7 17 20"/>`;

const ART = {
  orbit: svg(`
    <path class="ha-shade" d="M120 36 236 46V74L120 84Z"/>
    <circle class="ha-clay" cx="24" cy="60" r="9"/>
    <path class="ha-clay" d="M24 45v-6M24 75v6M9 60H3M39 60h6M13.4 49.4l-4.2-4.2M34.6 70.6l4.2 4.2M13.4 70.6l-4.2 4.2M34.6 49.4l4.2-4.2"/>
    <path class="ha-dim ha-dash" d="M54 42h22M54 78h22"/>
    <circle class="ha-dim ha-dash" cx="120" cy="60" r="42"/>
    <circle class="ha-purple ha-earth" cx="120" cy="60" r="24"/>
    <path class="ha-shade" d="M120 36a24 24 0 0 1 0 48Z"/>
    <path class="ha-dim" d="M162 47v-6M162 73v6"/>
    <rect class="ha-lilac ha-bg" x="156" y="54" width="12" height="12" rx="2"/>
    <path class="ha-lilac" d="M186 60h-12M178 56l-4 4 4 4"/>
    <rect class="ha-lilac" x="190" y="50" width="32" height="20" rx="3"/>
    <path class="ha-lilac" d="M226 56v8"/>
    <rect class="ha-fill-lilac" x="194" y="54" width="12" height="12" rx="1"/>`),
  heat: svg(`
    <rect class="ha-ivory" x="14" y="36" width="48" height="48" rx="9"/>
    <path class="ha-clay" d="M42 46 32 62h8l-4 12 12-16h-8l4-12Z"/>
    <path class="ha-clay" d="M62 50h88M100 45l6 5-6 5"/>
    <path class="ha-lilac" d="M150 70H62M112 65l-6 5 6 5"/>
    <rect class="ha-ivory ha-bg" x="150" y="22" width="40" height="76" rx="3"/>
    <path class="ha-dim ha-thin" d="M156 34h28M156 46h28M156 58h28M156 70h28M156 82h28"/>
    <path class="ha-clay ha-thin" d="M202 36c5 4-5 8 0 12s-5 8 0 12M214 50c5 4-5 8 0 12s-5 8 0 12M226 36c5 4-5 8 0 12s-5 8 0 12"/>`),
  air: svg(`
    <rect class="ha-ivory" x="20" y="28" width="56" height="64" rx="9"/>
    <circle class="ha-lilac" cx="38" cy="48" r="7"/>
    <circle class="ha-lilac" cx="58" cy="48" r="7"/>
    <path class="ha-dim" d="M32 70h32M32 78h32"/>
    <path class="ha-lilac ha-dash" d="M86 36h70"/>
    <path class="ha-lilac" d="M152 31l6 5-6 5"/>
    <text class="ha-text ha-text-lilac" x="104" y="28">O₂</text>
    <path class="ha-clay ha-dash" d="M158 84H88"/>
    <path class="ha-clay" d="M92 79l-6 5 6 5"/>
    <text class="ha-text ha-text-clay" x="100" y="104">CO₂</text>
    <path class="ha-lilac" d="M124 47c-5 7-8 11-8 15a8 8 0 0 0 16 0c0-4-3-8-8-15Z"/>
    ${person(196, 'ha-ivory')}`),
  wear: svg(`
    <path class="ha-lilac ha-thick" d="M24 84a46 46 0 0 1 69-39.8"/>
    <path class="ha-clay ha-thick" d="M93 44.2A46 46 0 0 1 116 84"/>
    <path class="ha-ivory" d="M70 84l31-22"/>
    <circle class="ha-ivory ha-bg" cx="70" cy="84" r="4"/>
    <text class="ha-text ha-mid" x="70" y="106">WEAR</text>
    <g transform="rotate(-40 178 60)">
      <rect class="ha-ivory" x="138" y="55" width="62" height="10" rx="5"/>
      <circle class="ha-ivory" cx="146" cy="60" r="1.5"/>
      <path class="ha-ivory ha-bg" d="M213.5 49.4A13 13 0 1 0 213.5 70.6L207 65V55Z"/>
    </g>`),
  money: svg(`
    <ellipse class="ha-ivory" cx="30" cy="52" rx="14" ry="5"/>
    <path class="ha-ivory" d="M16 52v18a14 5 0 0 0 28 0V52M16 61a14 5 0 0 0 28 0"/>
    <path class="ha-dim ha-dash" d="M56 22h146"/>
    <path class="ha-dim" d="M56 76h150"/>
    <rect class="ha-lilac" x="62" y="58" width="18" height="18" rx="2"/>
    <rect class="ha-lilac" x="90" y="48" width="18" height="28" rx="2"/>
    <rect class="ha-clay" x="118" y="76" width="18" height="14" rx="2"/>
    <rect class="ha-lilac" x="146" y="42" width="18" height="34" rx="2"/>
    <rect class="ha-lilac ha-soft" x="174" y="30" width="18" height="46" rx="2"/>
    <path class="ha-ivory" d="M212 92V14"/>
    <path class="ha-lilac ha-soft" d="M212 14h20l-6 7 6 7h-20"/>`),
  people: svg(`
    ${person(34, 'ha-ivory')}
    ${person(78, 'ha-lilac')}
    <path class="ha-line-track" d="M20 98h28M64 98h28"/>
    <path class="ha-lilac" d="M20 98h22"/>
    <path class="ha-clay" d="M64 98h9"/>
    <path class="ha-dim" d="M114 22v76"/>
    ${star(138, 40, 'ha-fill-lilac')}${star(160, 40, 'ha-fill-lilac')}${star(182, 40, 'ha-fill-lilac')}${star(204, 40, 'ha-fill-lilac')}${star(226, 40, 'ha-dim')}
    <path class="ha-ivory" d="M136 62h84a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6h-62l-9 9v-9h-13a6 6 0 0 1-6-6V68a6 6 0 0 1 6-6Z"/>
    <path class="ha-dim ha-thin" d="M140 71h66M140 78h44"/>`),
  build: svg(`
    <path class="ha-dim" d="M56 44V28"/>
    <rect class="ha-dim" x="36" y="12" width="40" height="16" rx="2"/>
    <path class="ha-dim ha-thin" d="M46 12v16M56 12v16M66 12v16"/>
    <rect class="ha-ivory ha-bg" x="22" y="44" width="66" height="32" rx="11"/>
    <circle class="ha-ivory" cx="42" cy="60" r="3"/>
    <circle class="ha-ivory" cx="56" cy="60" r="3"/>
    <circle class="ha-lilac ha-pulse" cx="96" cy="60" r="14"/>
    <circle class="ha-lilac" cx="96" cy="60" r="8"/>
    <circle class="ha-fill-lilac" cx="96" cy="60" r="3.5"/>
    <path class="ha-lilac ha-dash" d="M106 60h8"/>
    <rect class="ha-lilac ha-dash" x="116" y="46" width="62" height="28" rx="10"/>
    <circle class="ha-ivory" cx="210" cy="56" r="16"/>
    <path class="ha-ivory" d="M210 46v10l7 4"/>
    <text class="ha-text ha-mid" x="210" y="94">6 h</text>`),
};

export const HELP_PAGES: readonly HelpPage[] = [
  {
    title: 'Sunlight and power',
    art: ART.orbit,
    text: [
      'The station circles Earth about every 92 minutes and, on most orbits, spends part of each one in Earth’s shadow. Solar arrays give nothing there, so the batteries carry every load until sunrise.',
      'When the charge runs low, loads are shed by tier: Commercial first, then Essential, and Critical last, which is the point of calling it Critical. Switch modules off from their sheets, or build more batteries and arrays.',
    ],
  },
  {
    title: 'Heat',
    art: ART.heat,
    text: [
      'Every kilowatt a module draws ends up as heat in one shared coolant loop. Radiators dump it to space, though about a third less in sunlight.',
      'A hot loop slows Commercial loads; hotter still, whole tiers trip offline until it cools. Unfold the power card and tap *Heat* to see which modules are cooking.',
    ],
  },
  {
    title: 'Life support',
    art: ART.air,
    text: [
      'The Life Support Rack makes oxygen, scrubs CO₂ and recycles water for everyone aboard, guests included, but only while it has power.',
      'So a power or heat problem soon becomes a breathing problem: CO₂ builds in hours, oxygen runs out in days, water in weeks. If crew condition falls below 15%, everyone is evacuated, and they will have notes.',
    ],
  },
  {
    title: 'Wear and repairs',
    art: ART.wear,
    text: [
      'Modules wear while they run, faster when hot, and a worn one is far more likely to break. Tap it and choose *Service* to make it like new; it’s offline while the work is done.',
      'A repair after a breakdown takes twice as long and costs three times as much in parts. Each engineer takes one job at a time, and the warnings button traces every problem to its cause.',
    ],
  },
  {
    title: 'Money and goals',
    art: ART.money,
    text: [
      'Guests pay while their habitat runs, and labs earn by finishing contracts from *Finance* on time; late ones cost a penalty. Wages, operations and loan interest tick away by the minute, and every game day closes a quarter with a report.',
      'Your goal sits at the top of *Finance*; miss its deadline and the board finds someone else. Let cash fall below −\u2060$20M, or close two quarters running in the red, and the bank takes the station.',
    ],
  },
  {
    title: 'Crew and guests',
    art: ART.people,
    text: [
      'Engineers do the repairs and scientists run the labs. Tap *Crew* in the top bar to hire, bunks permitting.',
      'Tired, glum people work slowly and eventually quit; a galley, a cupola or a bonus helps. Guests review the station each quarter: heat, stale air or a dark habitat cost stars, and fewer stars mean lower fares and empty places.',
    ],
  },
  {
    title: 'Building and controls',
    art: ART.build,
    text: [
      'Tap *Build*, pick a module, then tap a glowing port. The preview shows how the next two orbits change; *Order* pays now, and it docks six hours later.',
      'Drag to orbit the view, pinch or scroll to zoom, and tap a module for its details. *Space* pauses and *1*–*4* set the speed. The menu button, or *Esc*, has saves, settings and photo mode.',
    ],
  },
];

/** Any page number, negative or past the end, folded back into 0..count−1. */
export function wrapPage(page: number, count: number): number {
  if (count <= 0) return 0;
  return ((Math.trunc(page) % count) + count) % count;
}

/** A paragraph with its `*labels*` in bold. */
function paragraph(text: string): HTMLElement {
  return el(
    'p',
    'help-text',
    text.split('*').map((part, i) => (i % 2 === 1 ? el('b', '', [part]) : part)),
  );
}

export class HelpSheet {
  readonly root = el('div', 'report-scrim help-scrim');
  private readonly card = el('section', 'report-sheet help-sheet');
  private readonly kicker = el('p', 'report-kicker help-kicker');
  private readonly body = el('div', 'help-body');
  private readonly backButton = el('button', 'warn-act report-continue help-back', ['Back']);
  private readonly nextButton = el('button', 'warn-act primary report-continue help-next', ['Next']);
  private readonly dots: HTMLButtonElement[] = [];
  /** Built once; the body shows one at a time. */
  private readonly pageEls: HTMLElement[];
  private open = false;
  private current = 0;
  private swipe: { id: number; x: number; y: number } | null = null;

  constructor(
    parent: HTMLElement,
    private readonly handlers: { onClose(): void },
  ) {
    this.pageEls = HELP_PAGES.map((p) => {
      const art = el('div', 'help-art');
      art.innerHTML = p.art;
      return el('article', 'help-page', [art, el('div', 'help-copy', [el('h2', 'end-title help-title', [p.title]), ...p.text.map(paragraph)])]);
    });

    const close = el('button', 'sheet-close help-close', ['×']);
    close.type = 'button';
    close.setAttribute('aria-label', 'Close how to play');
    close.addEventListener('click', () => this.finish());

    this.backButton.type = 'button';
    this.backButton.addEventListener('click', () => this.back());
    this.nextButton.type = 'button';
    this.nextButton.addEventListener('click', () => (this.current === HELP_PAGES.length - 1 ? this.finish() : this.next()));

    const dotRow = el('div', 'help-dots');
    HELP_PAGES.forEach((p, i) => {
      const dot = el('button', 'help-dot');
      dot.type = 'button';
      dot.setAttribute('aria-label', `Page ${i + 1}: ${p.title}`);
      dot.addEventListener('click', () => this.go(i, i < this.current ? 'back' : 'next'));
      this.dots.push(dot);
      dotRow.append(dot);
    });

    // Screen readers hear the new page when it changes.
    this.body.setAttribute('aria-live', 'polite');
    this.card.append(el('div', 'help-head', [this.kicker, close]), this.body, el('div', 'help-foot', [dotRow, this.backButton, this.nextButton]));
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-modal', 'true');
    this.card.setAttribute('aria-label', 'How to play');
    this.listenForSwipes();
    this.root.append(this.card);
    this.root.setAttribute('aria-hidden', 'true');
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** The page showing, from 0. */
  get page(): number {
    return this.current;
  }

  show(page = 0): void {
    this.open = true;
    this.go(page, null);
    setClass(this.root, 'open', true);
    this.root.setAttribute('aria-hidden', 'false');
    this.nextButton.focus({ preventScroll: true });
  }

  close(): void {
    this.open = false;
    this.swipe = null;
    setClass(this.root, 'open', false);
    this.root.setAttribute('aria-hidden', 'true');
  }

  /** Forward one page; past the last it wraps to the first. The buttons never wrap: the last one says Done. */
  next(): void {
    this.go(this.current + 1, 'next');
  }

  /** Back one page; before the first it wraps to the last. */
  back(): void {
    this.go(this.current - 1, 'back');
  }

  /** Arrow keys turn the page. Returns true if the key was used. */
  keydown(key: string): boolean {
    if (!this.open) return false;
    if (key === 'ArrowRight') this.next();
    else if (key === 'ArrowLeft') this.back();
    else return false;
    return true;
  }

  /** The user is done with the guide: Done on the last page, or ×. */
  private finish(): void {
    this.close();
    this.handlers.onClose();
  }

  private go(page: number, from: 'next' | 'back' | null): void {
    const count = HELP_PAGES.length;
    this.current = wrapPage(page, count);
    const pageEl = this.pageEls[this.current]!;
    // Re-inserting the page restarts its slide-in, from the side it came from.
    setClass(pageEl, 'from-right', from === 'next');
    setClass(pageEl, 'from-left', from === 'back');
    this.body.replaceChildren(pageEl);
    this.body.scrollTop = 0;
    setText(this.kicker, `How to play · ${this.current + 1} of ${count}`);
    this.dots.forEach((d, i) => {
      setClass(d, 'on', i === this.current);
      d.setAttribute('aria-current', i === this.current ? 'step' : 'false');
    });
    this.backButton.disabled = this.current === 0;
    setText(this.nextButton, this.current === count - 1 ? 'Done' : 'Next');
  }

  /** Touch and pen only: a mouse has the buttons and the arrow keys. */
  private listenForSwipes(): void {
    this.card.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || !e.isPrimary) return;
      this.swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    this.card.addEventListener('pointerup', (e: PointerEvent) => {
      const s = this.swipe;
      this.swipe = null;
      if (!s || s.id !== e.pointerId || !this.open) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      // Unlike next() and back(), a swipe stops at either end, like the buttons: flicking past Done shouldn't restart.
      if (dx < 0 && this.current < HELP_PAGES.length - 1) this.next();
      else if (dx > 0 && this.current > 0) this.back();
    });
    this.card.addEventListener('pointercancel', () => (this.swipe = null));
  }
}
