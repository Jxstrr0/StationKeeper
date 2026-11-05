// A tiny typed event bus. The sim emits; the UI listens.
import type { Tier } from './types';

export interface SimEvents {
  eclipseBegan: { minutes: number };
  sunrise: { minutes: number };
  tierShed: { tier: Tier; charge: number };
  tierRestored: { tier: Tier; charge: number };
  moduleShed: { moduleId: string; tier: Tier };
  moduleRestored: { moduleId: string; tier: Tier };
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
