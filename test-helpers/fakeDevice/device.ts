/**
 * The one fake Supernote a scenario test runs against: a FakeFs, a FakeSdk on
 * top of it, and the log lines the app wrote. test-helpers/fakeDevice/setup.ts
 * installs it as `NativeModules.GtdParaFile`, `sn-plugin-lib` and `utils/log`
 * before any app module loads; `resetDevice()` starts each scenario from an
 * empty device (docs/dev/history/technical-design-quality-hardening.md §4.2).
 */
import {FakeFs} from './fakeFs';
import {FakeSdk} from './fakeSdk';

export interface LogLine {
  level: 'info' | 'warn' | 'error';
  text: string;
}

export interface Device {
  fs: FakeFs;
  sdk: FakeSdk;
  logs: LogLine[];
}

function fresh(): Device {
  const fs = new FakeFs();
  return {fs, sdk: new FakeSdk(fs), logs: []};
}

let current: Device = fresh();

/** The device of the running scenario. */
export function device(): Device {
  return current;
}

export function resetDevice(): Device {
  current = fresh();
  return current;
}

/**
 * An object whose properties always read from `pick(device())`, so modules
 * that captured the native module or an SDK object at import time still talk
 * to the current device after a reset.
 */
export function forwarding<T extends object>(pick: (d: Device) => T): T {
  return new Proxy({} as T, {
    get: (_target, prop) => {
      const value = (pick(current) as Record<string | symbol, unknown>)[prop];
      return typeof value === 'function' ? value.bind(pick(current)) : value;
    },
    has: (_target, prop) => prop in pick(current),
  });
}
