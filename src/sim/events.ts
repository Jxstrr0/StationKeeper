// A tiny typed event bus. The sim emits; the UI listens.
import type { LifeSupportSnapshot, Tier } from './types';

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
