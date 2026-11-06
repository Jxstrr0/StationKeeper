import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HELP_PAGES, HelpSheet, wrapPage } from '../src/ui/helpSheet';

// Tests run in node with no DOM library, so this is just enough of one for the sheet: elements, classes, attributes,
// text and listeners.
type Listener = (e: object) => void;

class FakeElement {
  className = '';
  type = '';
  disabled = false;
  innerHTML = '';
  scrollTop = 0;
  readonly children: (FakeElement | string)[] = [];
  private readonly attrs = new Map<string, string>();
  private readonly listeners = new Map<string, Listener[]>();
  readonly classList = {
    contains: (name: string) => this.className.split(/\s+/).includes(name),
    toggle: (name: string, on?: boolean) => {
      const has = this.classList.contains(name);
      const want = on ?? !has;
      if (want && !has) this.className = `${this.className} ${name}`.trim();
      if (!want && has) this.className = this.className.split(/\s+/).filter((c) => c !== name).join(' ');
      return want;
    },
  };

  constructor(readonly tagName: string) {}

  get textContent(): string {
    return this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join('');
  }

  set textContent(text: string) {
    this.children.splice(0, this.children.length, text);
  }

  append(...nodes: (FakeElement | string)[]): void {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: (FakeElement | string)[]): void {
    this.children.splice(0, this.children.length, ...nodes);
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  addEventListener(type: string, fn: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }

  dispatch(type: string, event: object = {}): void {
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }

  /** Like a real button, a disabled one ignores clicks. */
  click(): void {
    if (!this.disabled) this.dispatch('click');
  }

  focus(): void {}
}

function find(root: FakeElement, cls: string): FakeElement[] {
  const out: FakeElement[] = [];
  const walk = (n: FakeElement) => {
    if (n.classList.contains(cls)) out.push(n);
    for (const c of n.children) if (typeof c !== 'string') walk(c);
  };
  walk(root);
  return out;
}

function one(root: FakeElement, cls: string): FakeElement {
  const [found] = find(root, cls);
  if (!found) throw new Error(`No .${cls}`);
  return found;
}

vi.stubGlobal('document', { createElement: (tag: string) => new FakeElement(tag) });
afterAll(() => vi.unstubAllGlobals());

const count = HELP_PAGES.length;

function setup() {
  const parent = new FakeElement('div');
  const onClose = vi.fn();
  const sheet = new HelpSheet(parent as unknown as HTMLElement, { onClose });
  const root = sheet.root as unknown as FakeElement;
  const next = one(root, 'help-next');
  const back = one(root, 'help-back');
  const title = () => one(root, 'help-body').textContent;
  return { parent, sheet, root, next, back, title, onClose };
}

describe('how to play pages', () => {
  it('has a handful of short pages, each with a picture', () => {
    expect(count).toBeGreaterThanOrEqual(6);
    expect(count).toBeLessThanOrEqual(8);
    for (const p of HELP_PAGES) {
      expect(p.art).toMatch(/^<svg viewBox="0 0 240 120"/);
      expect(p.text.length).toBeGreaterThan(0);
      // Every *label* is closed.
      for (const t of p.text) expect(t.split('*').length % 2).toBe(1);
    }
  });

  it('folds any page number back into range', () => {
    expect(wrapPage(0, 7)).toBe(0);
    expect(wrapPage(7, 7)).toBe(0);
    expect(wrapPage(9, 7)).toBe(2);
    expect(wrapPage(-1, 7)).toBe(6);
    expect(wrapPage(-8, 7)).toBe(6);
  });
});

describe('HelpSheet', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => (s = setup()));

  it('starts closed and attached to its parent, then opens on the page asked for', () => {
    expect(s.parent.children).toContain(s.root);
    expect(s.sheet.isOpen).toBe(false);
    expect(s.root.getAttribute('aria-hidden')).toBe('true');
    s.sheet.show(2);
    expect(s.sheet.isOpen).toBe(true);
    expect(s.sheet.page).toBe(2);
    expect(s.root.classList.contains('open')).toBe(true);
    expect(s.root.getAttribute('aria-hidden')).toBe('false');
    expect(s.title()).toContain(HELP_PAGES[2]!.title);
    expect(one(s.root, 'help-kicker').textContent).toBe(`How to play · 3 of ${count}`);
    s.sheet.show();
    expect(s.sheet.page).toBe(0);
  });

  it('steps forward and back, and wraps at both ends', () => {
    s.sheet.show();
    s.sheet.next();
    expect(s.sheet.page).toBe(1);
    s.sheet.back();
    s.sheet.back();
    expect(s.sheet.page).toBe(count - 1);
    s.sheet.next();
    expect(s.sheet.page).toBe(0);
    s.sheet.show(count + 1);
    expect(s.sheet.page).toBe(1);
  });

  it('marks the current dot, and a dot jumps to its page', () => {
    s.sheet.show(1);
    const dots = find(s.root, 'help-dot');
    expect(dots).toHaveLength(count);
    expect(dots.map((d) => d.classList.contains('on'))).toEqual(HELP_PAGES.map((_, i) => i === 1));
    dots[4]!.click();
    expect(s.sheet.page).toBe(4);
    expect(dots[4]!.getAttribute('aria-current')).toBe('step');
    expect(dots[1]!.getAttribute('aria-current')).toBe('false');
  });

  it('hides Back on the first page and turns Next into Done on the last', () => {
    s.sheet.show();
    expect(s.back.disabled).toBe(true);
    expect(s.next.textContent).toBe('Next');
    s.next.click();
    expect(s.back.disabled).toBe(false);
    s.back.click();
    expect(s.sheet.page).toBe(0);
    s.back.click();
    expect(s.sheet.page).toBe(0);
    s.sheet.show(count - 1);
    expect(s.next.textContent).toBe('Done');
  });

  it('closes and calls onClose on Done or ×, but close() alone calls nothing', () => {
    s.sheet.show();
    s.sheet.close();
    expect(s.sheet.isOpen).toBe(false);
    expect(s.root.classList.contains('open')).toBe(false);
    expect(s.onClose).not.toHaveBeenCalled();

    s.sheet.show();
    for (let i = 0; i < count - 1; i++) s.next.click();
    expect(s.sheet.page).toBe(count - 1);
    expect(s.onClose).not.toHaveBeenCalled();
    s.next.click();
    expect(s.sheet.isOpen).toBe(false);
    expect(s.onClose).toHaveBeenCalledTimes(1);

    s.sheet.show(3);
    one(s.root, 'help-close').click();
    expect(s.sheet.isOpen).toBe(false);
    expect(s.onClose).toHaveBeenCalledTimes(2);
  });

  it('turns pages with the arrow keys only while open', () => {
    expect(s.sheet.keydown('ArrowRight')).toBe(false);
    expect(s.sheet.page).toBe(0);
    s.sheet.show();
    expect(s.sheet.keydown('ArrowRight')).toBe(true);
    expect(s.sheet.page).toBe(1);
    expect(s.sheet.keydown('ArrowLeft')).toBe(true);
    expect(s.sheet.keydown('ArrowLeft')).toBe(true);
    expect(s.sheet.page).toBe(count - 1);
    expect(s.sheet.keydown('Enter')).toBe(false);
    expect(s.sheet.keydown(' ')).toBe(false);
    expect(s.sheet.page).toBe(count - 1);
  });

  it('turns pages on a sideways touch swipe, but not on a short, steep or mouse drag, and not past either end', () => {
    const card = one(s.root, 'help-sheet');
    const swipe = (dx: number, dy = 0, pointerType = 'touch') => {
      card.dispatch('pointerdown', { pointerId: 1, pointerType, isPrimary: true, clientX: 200, clientY: 300 });
      card.dispatch('pointerup', { pointerId: 1, pointerType, isPrimary: true, clientX: 200 + dx, clientY: 300 + dy });
    };
    s.sheet.show();
    swipe(80);
    expect(s.sheet.page).toBe(0);
    swipe(-80);
    expect(s.sheet.page).toBe(1);
    swipe(-30);
    swipe(-60, 70);
    swipe(-120, 0, 'mouse');
    expect(s.sheet.page).toBe(1);
    swipe(70);
    expect(s.sheet.page).toBe(0);
    s.sheet.show(count - 1);
    swipe(-80);
    expect(s.sheet.page).toBe(count - 1);
  });
});
