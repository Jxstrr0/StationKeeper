// Short-lived notices for power events.
import { el } from './dom';

export type ToastKind = 'warn' | 'ok' | 'alarm';

const LIFETIME_MS = 4500;
const MAX_VISIBLE = 3;

export class Toasts {
  readonly root = el('div', 'toasts');

  constructor(parent: HTMLElement) {
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    parent.append(this.root);
  }

  show(text: string, kind: ToastKind): void {
    const t = el('div', `toast ${kind}`, [text]);
    this.root.prepend(t);
    while (this.root.children.length > MAX_VISIBLE) this.root.lastElementChild?.remove();
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => {
      t.classList.remove('in');
      setTimeout(() => t.remove(), 300);
    }, LIFETIME_MS);
  }
}
