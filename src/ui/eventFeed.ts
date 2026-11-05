// Turns sim events into toasts. Grounded, with the occasional dry aside.
import type { EventBus, SimEvents } from '../sim/events';
import type { Toasts } from './toasts';

const COMMERCIAL_SHED = [
  'Guests have been asked to stop charging their phones.',
  'The guest habitat goes quiet. The guests do not.',
  'Someone is going to mention this in a review.',
];

const COMMERCIAL_BACK = [
  'The coffee machine is first back online, naturally.',
  'Guests report the view is better with the lights on.',
  'Complaints desk reopened.',
];

export function connectEventFeed(events: EventBus<SimEvents>, toasts: Toasts, moduleName: (id: string) => string): void {
  let quip = 0;
  const pct = (c: number) => `${Math.round(c * 100)}%`;

  events.on('tierShed', ({ tier, charge }) => {
    if (tier === 'commercial') {
      toasts.show(`Commercial loads shed, battery at ${pct(charge)}. ${COMMERCIAL_SHED[quip++ % COMMERCIAL_SHED.length]}`, 'warn');
    } else if (tier === 'essential') {
      toasts.show(`Essential loads shed, battery at ${pct(charge)}. Array gimbals parked.`, 'warn');
    }
  });

  events.on('tierRestored', ({ tier }) => {
    if (tier === 'commercial') toasts.show(`Commercial loads restored. ${COMMERCIAL_BACK[quip++ % COMMERCIAL_BACK.length]}`, 'ok');
    else if (tier === 'essential') toasts.show('Essential loads restored.', 'ok');
  });

  events.on('moduleShed', ({ moduleId, tier }) => {
    if (tier === 'critical') toasts.show(`CRITICAL: ${moduleName(moduleId)} has lost power. Batteries are empty.`, 'alarm');
  });

  events.on('moduleRestored', ({ moduleId, tier }) => {
    if (tier === 'critical') toasts.show(`${moduleName(moduleId)} power restored.`, 'ok');
  });
}
