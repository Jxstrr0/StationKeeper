// A tiny typed event bus. The sim emits; the UI listens.
import type { CrewRole, LifeSupportSnapshot, Outcome, QuarterReport, Tier } from './types';

export type LifeSupportAlarm = keyof LifeSupportSnapshot['alarms'];

export interface SimEvents {
  eclipseBegan: { minutes: number };
  sunrise: { minutes: number };
  tierShed: { tier: Tier; charge: number };
  tierRestored: { tier: Tier; charge: number };
  moduleShed: { moduleId: string; tier: Tier };
  moduleRestored: { moduleId: string; tier: Tier };
  /** Coolant loop crossed the throttle band. */
  throttleChanged: { throttled: boolean; tempC: number };
  /** A tier tripped offline (or came back) because of loop temperature. */
  overheatTrip: { tier: Tier; tempC: number };
  overheatCleared: { tier: Tier; tempC: number };
  moduleOverheated: { moduleId: string; tier: Tier };
  /** A life support alarm raised or cleared. `value` is mmHg for CO2, a tank fraction for low tanks, kg for empty tanks, 0..1 for health. */
  lifeSupportAlarm: { alarm: LifeSupportAlarm; active: boolean; value: number };
  moduleAdded: { moduleId: string; defId: string };
  /** A module broke down from wear. */
  moduleFailed: { moduleId: string; tier: Tier };
  /** A module crossed into "due for service". */
  moduleWorn: { moduleId: string; wear: number };
  repairStarted: { moduleId: string; kind: 'service' | 'repair'; hours: number };
  repairDone: { moduleId: string; kind: 'service' | 'repair' };
  /** A module was paid for and is on its way up. */
  moduleOrdered: { moduleId: string; defId: string; cost: number; hours: number };
  contractAccepted: { uid: string; title: string };
  contractCompleted: { uid: string; title: string; reward: number };
  contractFailed: { uid: string; title: string; penalty: number; abandoned: boolean };
  quarterReport: { report: QuarterReport };
  /** Someone was signed up and is on their way. */
  crewHired: { crewId: string; name: string; role: CrewRole; hours: number };
  crewArrived: { crewId: string; name: string; role: CrewRole };
  /** Someone was sent home, their flight up cancelled, or they resigned. */
  crewLeft: { crewId: string; name: string; role: CrewRole; wasAboard: boolean; reason: 'dismissed' | 'resigned' };
  /** Someone worked until they couldn't, and is off duty until rested. */
  crewExhausted: { crewId: string; name: string; role: CrewRole };
  crewFellIll: { crewId: string; name: string; role: CrewRole; hours: number };
  crewRecovered: { crewId: string; name: string; role: CrewRole };
  /** The goal is reached. Fires once; play carries on. */
  goalReached: { minutes: number };
  /** The game is lost. The sim stops ticking after this. */
  gameOver: { outcome: Outcome; minutes: number };
}

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object> {
  private handlers: { [K in keyof E]?: Handler<E[K]>[] } = {};

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    const list = (this.handlers[type] ??= []);
    list.push(handler);
    return () => {
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    };
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const list = this.handlers[type];
    if (!list) return;
    for (const h of [...list]) h(payload);
  }
}
