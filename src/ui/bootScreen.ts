// The loading screen: #boot in index.html, which paints before any script runs.
//
// Until the game's code has downloaded the bar sweeps (the "wait" class). Once main.ts is running it reports
// each boot step here with how far along it is, and the bar fills for real. done() fades the screen out;
// fail() swaps the bar for the error and a Reload button.

function parts() {
  const root = document.getElementById('boot');
  if (!root) return null;
  return {
    root,
    line: root.querySelector<HTMLElement>('.boot-line'),
    bar: root.querySelector<HTMLElement>('.boot-bar'),
    msg: root.querySelector<HTMLElement>('.boot-msg'),
  };
}

/** Let the browser paint the new bar before the next (blocking) step. A timer backs up rAF in a hidden tab. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
    setTimeout(resolve, 60);
  });
}

let shown = 0;

/** Show progress from 0 to 1. The bar never moves backwards. Pass `paint` to wait for it to show on screen. */
export function bootProgress(fraction: number, line?: string, paint = true): Promise<void> {
  const p = parts();
  if (!p || p.root.classList.contains('error')) return Promise.resolve();
  shown = Math.max(shown, Math.min(1, Math.max(0, fraction)));
  p.root.classList.remove('wait');
  p.root.style.setProperty('--boot-p', String(shown));
  p.bar?.setAttribute('aria-valuenow', String(Math.round(shown * 100)));
  if (line && p.line) p.line.textContent = line;
  return paint ? nextPaint() : Promise.resolve();
}

/** Fade the loading screen out over the game, then remove it. */
export function bootDone(): void {
  const p = parts();
  if (!p) return;
  p.root.style.setProperty('--boot-p', '1');
  p.root.classList.add('done');
  setTimeout(() => p.root.remove(), 600);
}

/** The game could not start: say why and offer a Reload button. */
export function bootFail(err: unknown): void {
  const p = parts();
  if (!p) return;
  p.root.classList.remove('wait', 'done');
  p.root.classList.add('error');
  if (p.line) p.line.textContent = 'Station Keeper could not start';
  if (p.msg) p.msg.textContent = err instanceof Error ? err.message : String(err);
  p.root.querySelector<HTMLButtonElement>('.boot-reload')?.focus();
}
