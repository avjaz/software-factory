export interface Clock {
  readonly now: () => Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function since(clock: Clock, start: Date): number {
  return clock.now().getTime() - start.getTime();
}
