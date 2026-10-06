/**
 * Experimental feature switches (docs/dev/history/technical-design-about-debug-experimental.md
 * §3.1-3.2). Google Calendar and Gmail depend on external services and are
 * shown only when switched on in Settings → Advanced. Switching one off
 * hides its entry points; its configuration stays stored.
 *
 * Pure domain logic, structurally typed (no import of settings.ts, which
 * imports reviewSteps.ts, which imports this file).
 */

export interface Features {
  googleCalendar: boolean;
  gmail: boolean;
}

/** What screens see before settings have loaded: integrations hidden. */
export const NO_EXPERIMENTAL_FEATURES: Features = {googleCalendar: false, gmail: false};

interface FeatureFlagFields {
  experimentalGoogleCalendar: boolean;
  experimentalGmail: boolean;
}

export function featuresOf(settings: FeatureFlagFields | null | undefined): Features {
  if (!settings) {return NO_EXPERIMENTAL_FEATURES;}
  return {
    googleCalendar: settings.experimentalGoogleCalendar === true,
    gmail: settings.experimentalGmail === true,
  };
}

interface MigratableFields extends FeatureFlagFields {
  googleCalendarIcsUrl: string;
  gmailEmail: string;
  lastSeenVersion: string;
}

/**
 * One-time defaults for the switches and the What's-new marker, run on every
 * settings load (storage/settingsStorage.ts), same contract as the other
 * migrations there: returns the SAME object when nothing changes.
 *
 * - Existing install (a stored blob exists) without the switch keys: a switch
 *   starts ON when its integration is already configured, so nothing
 *   disappears after the update. `lastSeenVersion` stays '' so the
 *   "Updated to …" notice shows once.
 * - Fresh install (nothing stored): switches stay OFF (defaults) and
 *   `lastSeenVersion` becomes `currentVersion`, so no notice.
 */
export function migrateExperimentalFlags<T extends MigratableFields>(
  merged: T,
  rawStored: unknown,
  currentVersion: string,
): T {
  const raw = rawStored && typeof rawStored === 'object' ? (rawStored as Record<string, unknown>) : {};
  const freshInstall = Object.keys(raw).length === 0;
  let next = merged;
  if (freshInstall) {
    if (!merged.lastSeenVersion) {next = {...next, lastSeenVersion: currentVersion};}
    return next;
  }
  if (raw.experimentalGoogleCalendar === undefined) {
    next = {...next, experimentalGoogleCalendar: (merged.googleCalendarIcsUrl ?? '').trim() !== ''};
  }
  if (raw.experimentalGmail === undefined) {
    next = {...next, experimentalGmail: (merged.gmailEmail ?? '').trim() !== ''};
  }
  return next;
}

/**
 * Whether the one-time "Updated to x.y.z" notice should show: only for
 * release builds, only when the user hasn't acknowledged this version yet
 * (lastSeenVersion is written only when they tap "What's new" or ✕, so a
 * start that was interrupted by the host's stale-build restart shows it
 * again next time).
 */
export function shouldShowWhatsNew(lastSeenVersion: string, build: {version: string; release: boolean}): boolean {
  return build.release && lastSeenVersion !== build.version;
}
