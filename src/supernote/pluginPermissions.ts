import {PluginManager} from 'sn-plugin-lib';
import {log, logError} from '../utils/log';
import {perfEnd, perfStart} from '../utils/perf';
import {errorMessage} from '../utils/errorMessage';

export const FILE_READ_PERMISSION = 'plugin.permission.FILE:READ';
export const FILE_WRITE_PERMISSION = 'plugin.permission.FILE:WRITE';
export const FILE_DELETE_PERMISSION = 'plugin.permission.FILE:DELETE';
export const INTERNET_PERMISSION = 'plugin.permission.INTERNET';

type PermissionAwareManager = typeof PluginManager & {
  hasPermission?: (name: string) => Promise<number>;
  requestPermission?: (name: string, desc?: string) => Promise<number>;
};

const pending = new Map<string, Promise<boolean>>();

// Observed in practice: the host's hasPermission/requestPermission bridge
// calls can simply never resolve (no dialog shown, no rejection either) -
// e.g. when the host doesn't support prompting for a given permission at
// runtime at all. Without a bound on the wait, every caller
// (readTextFile/writeTextFile/openPath) sits there awaiting forever with no
// error and no data, which looks like total silence in the UI - exactly the
// "+Add does nothing, nothing appears, no error" symptom. This turns a stuck
// bridge call into a clear, catchable error instead of an infinite hang.
const PERMISSION_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${PERMISSION_TIMEOUT_MS}ms - the host never responded`));
    }, PERMISSION_TIMEOUT_MS);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Requests a plugin.permission.* grant if the host exposes the runtime
 * permission API (the firmware shipping alongside sn-plugin-lib 0.1.65+,
 * see sdk-migration-0.1.65-analysis.md). On older hosts without
 * hasPermission/requestPermission, treats the operation as already allowed
 * rather than blocking on an API that doesn't exist there.
 */
export async function ensurePluginPermission(
  permission: string,
  description: string,
): Promise<boolean> {
  const manager = PluginManager as PermissionAwareManager;

  if (
    typeof manager.hasPermission !== 'function' ||
    typeof manager.requestPermission !== 'function'
  ) {
    log('ensurePluginPermission: host has no runtime permission API, treating as granted', permission);
    return true;
  }

  const existing = pending.get(permission);
  if (existing) return existing;
  const perfToken = perfStart();

  const request = (async () => {
    try {
      log('ensurePluginPermission: calling hasPermission', permission);
      const has = Number(
        await withTimeout(manager.hasPermission!(permission), `hasPermission(${permission})`),
      );
      log('ensurePluginPermission: hasPermission', permission, '=>', has);
      if (has > 0) return true;

      log('ensurePluginPermission: calling requestPermission', permission);
      const requested = Number(
        await withTimeout(
          manager.requestPermission!(permission, description),
          `requestPermission(${permission})`,
        ),
      );
      log('ensurePluginPermission: requestPermission', permission, '=>', requested);
      return requested > 0;
    } catch (e) {
      logError(
        'ensurePluginPermission: error',
        permission,
        errorMessage(e),
      );
      return false;
    }
  })();

  pending.set(permission, request);
  try {
    return await request;
  } finally {
    pending.delete(permission);
    perfEnd('io:permission', perfToken, {permission});
  }
}

export function ensureFileReadPermission(): Promise<boolean> {
  return ensurePluginPermission(
    FILE_READ_PERMISSION,
    'Allow GtdPara to read your Project and Area folders.',
  );
}

export function ensureFileWritePermission(): Promise<boolean> {
  return ensurePluginPermission(
    FILE_WRITE_PERMISSION,
    'Allow GtdPara to create and update project and area files.',
  );
}

/**
 * FILE:DELETE, requested only AFTER the user confirmed a delete in the UI
 * (docs/dev/history/technical-design-inkhub-submission.md §3.4) - so `description`
 * names exactly what is about to be deleted, e.g. "Delete the empty folder
 * 2 Areas/Health after moving it to the Archive." Never requested eagerly.
 */
export function ensureFileDeletePermission(description: string): Promise<boolean> {
  return ensurePluginPermission(FILE_DELETE_PERMISSION, description);
}

/**
 * The network-touching operations - Google Calendar's ICS fetch
 * (storage/googleCalendarCache.ts) and the Gmail IMAP calls
 * (storage/gmailImapNative.ts) - call this immediately before connecting,
 * never eagerly and never from Settings just because a URL was typed in.
 * Both integrations are opt-in (Settings -> Advanced, off by default).
 */
export function ensureInternetPermission(
  description = 'Allow GtdPara to connect to Google Calendar or Gmail - only when you tap Load or Refresh.',
): Promise<boolean> {
  return ensurePluginPermission(INTERNET_PERMISSION, description);
}
