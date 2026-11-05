// Tiny DOM helpers. Text updates skip the DOM when nothing changed, to keep frames cheap.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const c of children) node.append(c);
  return node;
}

const lastText = new WeakMap<Node, string>();

export function setText(node: HTMLElement, text: string): void {
  if (lastText.get(node) === text) return;
  lastText.set(node, text);
  node.textContent = text;
}

export function setClass(node: HTMLElement, name: string, on: boolean): void {
  if (node.classList.contains(name) !== on) node.classList.toggle(name, on);
}
