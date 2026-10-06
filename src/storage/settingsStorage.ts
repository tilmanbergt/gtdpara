import AsyncStorage from '@react-native-async-storage/async-storage';
import {DEFAULT_SETTINGS, GtdParaSettings} from '../domain/settings';
import {migrateNoteTemplateDefaults} from '../domain/noteTemplate';
import {ReviewStepsMap} from '../domain/reviewSteps';
import {perfEnd, perfStart} from '../utils/perf';
import {migrateExperimentalFlags} from '../domain/features';
import {BUILD_INFO} from '../generated/buildInfo';

const SETTINGS_KEY = 'gtdpara:settings:v1';

/**
 * Reads persisted settings, filling in any missing field from the defaults -
 * and THROWS if the stored blob can't be read or parsed. loadSettings below is
 * the forgiving wrapper (falls back to DEFAULT_SETTINGS); updateReviewSteps
 * uses this one directly so a failed read can never turn into "write the
 * defaults over the user's real settings".
 *
 * The loaded settings then pass through the load-time migrations, each of
 * which returns the SAME object when it has nothing to do:
 * - `migrateNoteTemplateDefaults` seeds the "Meeting (default)" Tag Rule
 *   when there are no rules yet (fresh install).
 * - `migrateExperimentalFlags` sets the experimental switches and the
 *   What's-new marker for an install that predates them; it needs the raw
 *   stored blob to tell a fresh install from an update.
 * When anything changed, the result is saved right away so the migration
 * runs once; a failed save is ignored (the values still apply this session,
 * and every migration is idempotent).
 */
async function readSettings(): Promise<GtdParaSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  const parsed = raw ? JSON.parse(raw) : {};
  const merged: GtdParaSettings = {...DEFAULT_SETTINGS, ...parsed};
  const noteMigrated = migrateNoteTemplateDefaults(merged);
  const migrated = migrateExperimentalFlags(noteMigrated, parsed, BUILD_INFO.version);
  if (migrated !== merged) {
    try {
      await saveSettings(migrated);
    } catch {
      // Best-effort: the migrated values still apply this session.
    }
  }
  return migrated;
}

/**
 * Loads persisted settings, filling in any missing field from the defaults.
 * This is plugin-internal configuration (not PARA content), so it's fine to
 * keep it in AsyncStorage rather than a filesystem-native file - unlike
 * Projects/Areas data, nobody needs to hand-edit this outside the plugin.
 * See readSettings above for the migrations it runs.
 */
export async function loadSettings(): Promise<GtdParaSettings> {
  const perfToken = perfStart();
  try {
    return await readSettings();
  } catch {
    return DEFAULT_SETTINGS;
  } finally {
    perfEnd('load:settings', perfToken);
  }
}

export async function saveSettings(settings: GtdParaSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/** Serializes updateReviewSteps calls - see below. */
let reviewStepsWriteChain: Promise<unknown> = Promise.resolve();

/**
 * Load-modify-save of just `settings.reviewSteps`, for the Review screen's
 * step-visit/empty-stamp writes (docs/dev/technical-design-review-hub.md §4.4).
 * Re-reads the stored settings each time (rather than saving the screen's own
 * possibly-stale copy) so a concurrent change made elsewhere - e.g. in
 * Settings - isn't overwritten, and chains every call behind the previous one
 * so two quick taps can't interleave their read and write. `mutate` must be
 * pure and return the SAME map reference when nothing changes; that case
 * skips the write entirely. Resolves to the settings as they stand after the
 * call; rejects (writing nothing) if the stored blob can't be read.
 */
export function updateReviewSteps(mutate: (steps: ReviewStepsMap) => ReviewStepsMap): Promise<GtdParaSettings> {
  const run = async (): Promise<GtdParaSettings> => {
    const current = await readSettings();
    const nextSteps = mutate(current.reviewSteps);
    if (nextSteps === current.reviewSteps) return current;
    const updated: GtdParaSettings = {...current, reviewSteps: nextSteps};
    await saveSettings(updated);
    return updated;
  };
  const result = reviewStepsWriteChain.then(run, run);
  reviewStepsWriteChain = result.catch(() => undefined);
  return result;
}

/**
 * Load-modify-save of a few top-level fields (switches in Settings → About /
 * Advanced, the What's-new marker). Re-reads what is stored so unsaved
 * drafts elsewhere in Settings are never written as a side effect, and
 * shares the write chain with updateReviewSteps. Resolves to the new settings.
 */
export function patchSettings(patch: Partial<GtdParaSettings>): Promise<GtdParaSettings> {
  const run = async (): Promise<GtdParaSettings> => {
    const current = await readSettings();
    const updated: GtdParaSettings = {...current, ...patch};
    await saveSettings(updated);
    return updated;
  };
  const result = reviewStepsWriteChain.then(run, run);
  reviewStepsWriteChain = result.catch(() => undefined);
  return result;
}
