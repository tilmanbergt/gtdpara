import AsyncStorage from '@react-native-async-storage/async-storage';
import {DEFAULT_SETTINGS, GtdParaSettings, renameLegacyTagRuleKeys} from '../domain/settings';
import {migrateNoteSetupSettings, migrationCounts} from '../domain/noteSetupMigration';
import {seedNoteSetupDefaults} from '../domain/noteSetups';
import {errorMessage} from '../utils/errorMessage';
import {log, logError} from '../utils/log';
import {markNoteSetupMigrationFailed} from './noteSetupMigrationState';
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
 * - `renameLegacyTagRuleKeys` moves Tag Rules stored under their 0.8 key
 *   names (`noteCreationDefinitions`, `nextNoteDefinitionId`) to the 0.14
 *   ones - first, so the migration below finds them.
 * - `migrateNoteSetups` turns 0.14's Tag Rules into Note setups once per
 *   settings blob or profile (domain/noteSetupMigration.ts), or seeds the
 *   Default on a fresh install. The Tag Rules stay stored as they are.
 * - `migrateExperimentalFlags` sets the experimental switches and the
 *   What's-new marker for an install that predates them; it needs the raw
 *   stored blob to tell a fresh install from an update.
 * When anything changed, the result is saved right away so the migration
 * runs once; a failed save is ignored (the values still apply this session,
 * and every migration is idempotent).
 */
async function readSettings(): Promise<GtdParaSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  const stored: Record<string, unknown> = raw ? JSON.parse(raw) : {};
  const parsed = renameLegacyTagRuleKeys(stored);
  const merged: GtdParaSettings = {...DEFAULT_SETTINGS, ...parsed};
  const noteMigrated = migrateNoteSetups(merged);
  const migrated = migrateExperimentalFlags(noteMigrated, parsed, BUILD_INFO.version);
  if (migrated !== merged || parsed !== stored) {
    try {
      await saveSettings(migrated);
    } catch {
      // Best-effort: the migrated values still apply this session.
    }
  }
  return migrated;
}

/**
 * The Note setups migration with its log line (counts only). A failure
 * leaves `noteSetupsMigrated` unset, so the next load tries again, and runs
 * this session on no setups plus the seeded Default.
 */
function migrateNoteSetups(settings: GtdParaSettings): GtdParaSettings {
  try {
    const migrated = migrateNoteSetupSettings(settings);
    if (migrated !== settings) log('NoteSetupMigration: migrated', migrationCounts(migrated));
    return migrated;
  } catch (e) {
    markNoteSetupMigrationFailed();
    logError('NoteSetupMigration: failed', errorMessage(e));
    return {...settings, noteSetups: [], noteSetupDefaults: seedNoteSetupDefaults(), noteSetupsNotice: null};
  }
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
 * step-visit/empty-stamp writes (docs/dev/history/technical-design-review-hub.md §4.4).
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
