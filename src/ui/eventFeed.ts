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

const THROTTLED = [
  'The coffee machine now takes its time.',
  'Guests are told the warmth is part of the experience.',
  'The habitat thermostat has been asked to be brave.',
];

const TRIP_TEXT = {
  commercial: 'Commercial loads tripped to stop the station cooking.',
  essential: 'Essential loads tripped. Array gimbals parked; radiator pumps kept running.',
  critical: 'Core systems tripped on overheat.',
} as const;

export function connectEventFeed(events: EventBus<SimEvents>, toasts: Toasts, moduleName: (id: string) => string): void {
  let quip = 0;
  const pct = (c: number) => `${Math.round(c * 100)}%`;

  events.on('tierShed', ({ tier, charge }) => {
    if (tier === 'commercial') {
      toasts.show(`Commercial loads shed, battery at ${pct(charge)}. ${COMMERCIAL_SHED[quip++ % COMMERCIAL_SHED.length]}`, 'warn');
    } else if (tier === 'essential') {
      toasts.show(`Essential loads shed, battery at ${pct(charge)}. Array gimbals and radiator pumps stopped: expect the loop to warm.`, 'warn');
    }
  });

  events.on('tierRestored', ({ tier }) => {
    if (tier === 'commercial') toasts.show(`Commercial loads restored. ${COMMERCIAL_BACK[quip++ % COMMERCIAL_BACK.length]}`, 'ok');
    else if (tier === 'essential') toasts.show('Essential loads restored.', 'ok');
  });

  events.on('moduleShed', ({ moduleId, tier }) => {
    if (tier === 'critical') toasts.show(`CRITICAL: ${moduleName(moduleId)} has lost power. Batteries are empty.`, 'alarm');
  });

  const deg = (c: number) => `${c.toFixed(1)}°C`;
  events.on('throttleChanged', ({ throttled, tempC }) => {
    if (throttled) toasts.show(`Coolant loop at ${deg(tempC)}. Commercial loads throttled. ${THROTTLED[quip++ % THROTTLED.length]}`, 'warn');
    else toasts.show(`Coolant loop back to ${deg(tempC)}. Throttle lifted.`, 'ok');
  });

  events.on('overheatTrip', ({ tier, tempC }) => {
    toasts.show(`${tier === 'critical' ? 'CRITICAL: c' : 'C'}oolant loop at ${deg(tempC)}. ${TRIP_TEXT[tier]}`, tier === 'critical' ? 'alarm' : 'warn');
  });

  events.on('overheatCleared', ({ tier, tempC }) => {
    const name = tier[0]!.toUpperCase() + tier.slice(1);
    toasts.show(`${name} loads back online, loop at ${deg(tempC)}.`, 'ok');
  });

  events.on('moduleRestored', ({ moduleId, tier }) => {
    if (tier === 'critical') toasts.show(`${moduleName(moduleId)} power restored.`, 'ok');
  });
}
