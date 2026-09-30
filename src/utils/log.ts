/**
 * Minimal logging helper so plugin behavior is visible in `adb logcat`.
 * console.log/console.error from RN surface under the `ReactNativeJS` tag;
 * the `[GtdPara]` prefix makes it easy to grep out from everything else
 * PluginHost logs. Pair with the native-side `GtdParaFile` tag
 * (GtdParaFileModule.kt) for the full picture:
 *
 *   adb logcat -c; <reproduce the issue>; adb logcat -d -s ReactNativeJS:V GtdParaFile:V
 *
 * Every line also goes to utils/logSink.ts: an in-memory buffer for the
 * debug bundle, and - while "Debug logging" is on - a log file
 * (docs/dev/technical-design-about-debug-experimental.md §3.3).
 */

import {perfAccum, perfCount, perfStart} from './perf';
import {recordLogLine} from './logSink';

const PREFIX = '[GtdPara]';

export function log(...args: unknown[]): void {
  // Every console call crosses the RN bridge - counted per perf trace
  // (docs/dev/technical-design-perf-tracing.md §5) to see what they cost.
  perfCount('console:log');
  const token = perfStart();
  recordLogLine('I', args);
  // eslint-disable-next-line no-console
  console.log(PREFIX, ...args);
  perfAccum('console:ms', token);
}

export function logWarn(...args: unknown[]): void {
  perfCount('console:warn');
  const token = perfStart();
  recordLogLine('W', args);
  // eslint-disable-next-line no-console
  console.warn(PREFIX, ...args);
  perfAccum('console:ms', token);
}

export function logError(...args: unknown[]): void {
  perfCount('console:error');
  const token = perfStart();
  recordLogLine('E', args);
  // eslint-disable-next-line no-console
  console.error(PREFIX, ...args);
  perfAccum('console:ms', token);
}
