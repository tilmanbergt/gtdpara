/**
 * JS side of the native `GtdParaRuntime` module (GtdParaRuntimeModule.kt /
 * PluginRuntimeGuard.kt) - docs/dev/history/technical-design-host-update-crash.md.
 *
 * `getRuntimeDiagnostics` reports the build, the device and whether an older
 * gtdpara build is still loaded in the host process. Older firmware kept the
 * old build loaded after an update and then crashed; the plugin firmware
 * gtdpara requires unloads it (docs/dev/history/technical-design-new-firmware.md D5),
 * so the check only feeds the debug bundle and one log line per start, to
 * catch a regression. Never throws.
 */
import {NativeModules} from 'react-native';
import {log, logError} from '../utils/log';
import {errorMessage} from '../utils/errorMessage';

const {GtdParaRuntime} = NativeModules;

export interface RuntimeDiagnostics {
  buildId: string;
  versionCode: string;
  loaderId: string;
  pid: number;
  processAgeMs: number;
  npkPath: string | null;
  /** Other gtdpara builds whose code is still mapped in this process. Non-empty = stale build present. */
  staleBuilds: string[];
  mappedFiles: string[];
  /** Builds that registered in this process so far, oldest first ("build@loader@loadedAtMs"). */
  registry: string[];
  scanError: string | null;
  /** Device facts (absent on older native builds). */
  model?: string;
  manufacturer?: string;
  /** Android Build.DISPLAY - on the Supernote usually the firmware version string. */
  display?: string;
  androidRelease?: string;
}

/** null when the native module is missing or the call failed (logged). */
export async function getRuntimeDiagnostics(): Promise<RuntimeDiagnostics | null> {
  if (!GtdParaRuntime?.getRuntimeDiagnostics) {
    logError('pluginRuntime: GtdParaRuntime native module not available');
    return null;
  }
  try {
    const d = (await GtdParaRuntime.getRuntimeDiagnostics()) as RuntimeDiagnostics;
    log('pluginRuntime: diagnostics', {
      buildId: d.buildId,
      versionCode: d.versionCode,
      loaderId: d.loaderId,
      pid: d.pid,
      processAgeMs: d.processAgeMs,
      staleBuilds: d.staleBuilds,
      registry: d.registry,
      scanError: d.scanError,
    });
    return d;
  } catch (e) {
    logError('pluginRuntime: getRuntimeDiagnostics failed', errorMessage(e));
    return null;
  }
}

/** Logs once how many older builds are still loaded (labels only); expected: none. Never throws. */
export async function logStaleBuilds(): Promise<void> {
  const d = await getRuntimeDiagnostics();
  if (d) log('pluginRuntime: stale builds', `n=${d.staleBuilds.length}`, d.staleBuilds.join(','));
}
