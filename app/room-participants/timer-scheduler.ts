export type TimerId = number;

export type TimerScheduler = {
  setTimeout(callback: () => void, milliseconds: number): TimerId;
  clearTimeout(timerId: TimerId): void;
};

export const browserTimerScheduler: TimerScheduler = {
  setTimeout: (callback, milliseconds): TimerId => window.setTimeout(callback, milliseconds),
  clearTimeout: timerId => {
    window.clearTimeout(timerId);
  },
};
