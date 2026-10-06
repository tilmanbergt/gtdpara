/**
 * JS side of the native `GtdParaRuntime` module (GtdParaRuntimeModule.kt /
 * PluginRuntimeGuard.kt) - docs/dev/technical-design-host-update-crash.md.
 *
 * The Supernote host installs a new gtdpara build into the already running
 * host process, next to the old one; that process then tends to crash a minute
 * or two later. `getRuntimeDiagnostics` reports whether an older build is
 * still loaded; `restartPluginHost` ends the host process in a controlled way
 * so the next tap starts clean. Both never throw.
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

/** Ends the plugin host process shortly after resolving; the next plugin tap starts it fresh. */
export async function restartPluginHost(reason: string): Promise<void> {
  if (!GtdParaRuntime?.restartPluginHost) {
    logError('pluginRuntime: restartPluginHost not available');
    return;
  }
  try {
    log('pluginRuntime: restarting plugin host', reason);
    await GtdParaRuntime.restartPluginHost(reason);
  } catch (e) {
    logError('pluginRuntime: restartPluginHost failed', errorMessage(e));
  }
}
