// Turns sim events into toasts. Grounded, with the occasional dry aside.
import type { EventBus, SimEvents } from '../sim/events';
import type { ModuleKind } from '../sim/types';
import { money } from './format';
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
  essential: 'Essential loads tripped, life support rack included. Radiator pumps kept running.',
  critical: 'Core systems tripped on overheat.',
} as const;

/** What a failure means, by module kind. */
const FAILED: Partial<Record<ModuleKind, string>> = {
  solar: 'Generation is down until the crew repairs it.',
  battery: 'Its stored energy is locked away until it is repaired.',
  radiator: 'Heat has nowhere to go. Expect the loop to climb.',
  lifesupport: 'No O₂ generation and no CO₂ scrubbing until it is repaired.',
  habitat: 'The guests have been moved to the core and are being very understanding about it.',
  lounge: 'The guests are back to drinking tea in their cabins, and will say so in their reviews.',
};

export function connectEventFeed(
  events: EventBus<SimEvents>,
  toasts: Toasts,
  moduleName: (id: string) => string,
  moduleKindOf: (id: string) => ModuleKind,
  defName: (defId: string) => string,
): void {
  let quip = 0;
  const pct = (c: number) => `${Math.round(c * 100)}%`;

  events.on('tierShed', ({ tier, charge }) => {
    if (tier === 'commercial') {
      toasts.show(`Commercial loads shed, battery at ${pct(charge)}. ${COMMERCIAL_SHED[quip++ % COMMERCIAL_SHED.length]}`, 'warn');
    } else if (tier === 'essential') {
      toasts.show(`Essential loads shed, battery at ${pct(charge)}. Gimbals, radiator pumps, and the life support rack stopped.`, 'warn');
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

  events.on('lifeSupportAlarm', ({ alarm, active, value }) => {
    const mmHg = `${value.toFixed(1)} mmHg`;
    switch (alarm) {
      case 'co2Warn':
        if (active) toasts.show(`CO₂ elevated at ${mmHg}. Crew report headaches and a strong opinion about the scrubbers.`, 'warn');
        else toasts.show(`CO₂ back down to ${mmHg}.`, 'ok');
        return;
      case 'co2Danger':
        if (active) toasts.show(`CO₂ at ${mmHg}. Crew condition is falling: get the life support rack running.`, 'alarm');
        return;
      case 'o2Low':
        if (active) toasts.show(`O₂ reserve down to ${Math.round(value * 100)}%.`, 'warn');
        return;
      case 'o2Out':
        if (active) toasts.show('CRITICAL: oxygen reserve is empty.', 'alarm');
        else toasts.show('Oxygen is flowing again.', 'ok');
        return;
      case 'waterLow':
        if (active) toasts.show(`Water down to ${Math.round(value * 100)}%. Showers are now a privilege.`, 'warn');
        return;
      case 'waterOut':
        if (active) toasts.show('CRITICAL: the water tanks are dry.', 'alarm');
        return;
      case 'healthLow':
        if (active) toasts.show(`Crew condition at ${Math.round(value * 100)}%. People are struggling, and much lower means evacuating them.`, 'alarm');
        else toasts.show('Crew condition is recovering.', 'ok');
        return;
    }
  });

  const roleName = (r: string) => (r === 'engineer' ? 'an engineer' : 'a scientist');
  events.on('crewHired', ({ name, role, hours }) => {
    toasts.show(`${name} signed on as ${roleName(role)}. On the next flight up, aboard in ${Math.round(hours)} h.`, 'ok');
  });
  events.on('crewArrived', ({ name, role }) => {
    toasts.show(
      role === 'engineer' ? `${name} is aboard, and the repair rota has another name on it.` : `${name} is aboard and already rearranging the lab.`,
      'ok',
    );
  });
  events.on('crewLeft', ({ name, wasAboard, reason }) => {
    if (reason === 'resigned') toasts.show(`${name} has resigned and is on the next flight down. The exit interview was brief.`, 'alarm');
    else toasts.show(wasAboard ? `${name} has gone home. Their mug stays.` : `${name}'s flight up is cancelled.`, 'warn');
  });
  events.on('crewExhausted', ({ name, role }) => {
    const gap = role === 'engineer' ? 'One repair team fewer until they have slept.' : 'Their lab slows down until they have slept.';
    toasts.show(`${name} is exhausted and off duty. ${gap}`, 'warn');
  });
  events.on('crewFellIll', ({ name, hours }) => {
    toasts.show(`${name} is ill and off duty for about ${Math.round(hours)} h. The medical kit is finally earning its keep.`, 'warn');
  });
  events.on('crewBonusPaid', ({ cost, people }) => {
    toasts.show(`Bonus paid: ${money(cost)} across ${people === 1 ? 'one person' : `${people} people`}. Spirits lift; productivity is rumoured to follow.`, 'ok');
  });
  events.on('crewRecovered', ({ name }) => {
    toasts.show(`${name} is well again and back on the rota.`, 'ok');
  });
  events.on('moduleFailed', ({ moduleId, tier }) => {
    const what = FAILED[moduleKindOf(moduleId)] ?? 'It will need a repair.';
    toasts.show(`${tier === 'commercial' ? '' : 'ALARM: '}${moduleName(moduleId)} failed. ${what}`, tier === 'commercial' ? 'warn' : 'alarm');
  });

  events.on('moduleWorn', ({ moduleId }) => {
    toasts.show(`${moduleName(moduleId)} is due for service. A planned service is quicker than a repair.`, 'warn');
  });

  events.on('repairStarted', ({ moduleId, kind, hours }) => {
    const time = hours >= 1 ? `${+hours.toFixed(1)} h` : `${Math.round(hours * 60)} min`;
    toasts.show(`Crew ${kind === 'repair' ? 'repairing' : 'servicing'} the ${moduleName(moduleId)}: ${time}, offline until done.`, 'ok');
  });

  events.on('repairDone', ({ moduleId, kind }) => {
    toasts.show(`${moduleName(moduleId)} ${kind === 'repair' ? 'repaired' : 'serviced'} and back to work, good as new.`, 'ok');
  });

  events.on('moduleOrdered', ({ defId, cost, hours }) => {
    const when = hours > 0 ? `It docks in ${+hours.toFixed(1)} h.` : 'It docks now.';
    toasts.show(`${defName(defId)} ordered for ${money(cost)}. ${when}`, 'ok');
  });

  events.on('moduleAdded', ({ moduleId }) => {
    toasts.show(`${moduleName(moduleId)} has docked and is coming online.`, 'ok');
  });

  events.on('waterResupplied', ({ kg, cost }) => {
    toasts.show(`The water run docked: ${Math.round(kg)} kg for ${money(cost)}. Nobody admits to having worried.`, 'ok');
  });

  events.on('contractAccepted', ({ title }) => {
    toasts.show(`Contract signed: ${title}. The lab is on it.`, 'ok');
  });

  events.on('contractCompleted', ({ title, reward }) => {
    toasts.show(`${title} delivered. ${money(reward)} received, and a polite thank-you email.`, 'ok');
  });

  events.on('contractFailed', ({ title, penalty, abandoned }) => {
    const why = abandoned ? 'abandoned' : 'missed its deadline';
    toasts.show(`${title} ${why}. ${money(penalty)} penalty. The sponsor is "disappointed".`, 'warn');
  });

  events.on('moduleRestored', ({ moduleId, tier }) => {
    if (tier === 'critical') toasts.show(`${moduleName(moduleId)} power restored.`, 'ok');
  });
}
