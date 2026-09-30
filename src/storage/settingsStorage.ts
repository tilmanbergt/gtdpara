import AsyncStorage from '@react-native-async-storage/async-storage';
import {DEFAULT_SETTINGS, GtdParaSettings} from '../domain/settings';
import {migrateNoteTemplateDefaults} from '../domain/noteTemplate';
import {migrateReviewSteps, ReviewStepsMap} from '../domain/reviewSteps';
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
 * Phase 2 addition (2026-09-18, docs/dev/technical-design-note-templates.md
 * §7): runs `migrateNoteTemplateDefaults` on the merged result before
 * returning it - the one-time seed of a "Meeting (default)" note-creation
 * definition, for both a genuinely fresh install (no saved blob at all) and
 * an existing one that predates this feature (saved blob has
 * `noteCreationDefinitions: []`, same shape DEFAULT_SETTINGS already
 * produces for either case, so one code path covers both rather than
 * branching on `raw` being present). When migration actually seeds
 * something (`migrated !== merged`, a plain reference check -
 * migrateNoteTemplateDefaults returns the SAME object back when it's a
 * no-op), the result is written back via `saveSettings` immediately, so the
 * seed is a true one-time migration - not re-derived (with a fresh
 * `nextNoteDefinitionId`-based id each time) on every subsequent load. A
 * write failure here is swallowed - migration is best-effort, never
 * something that should turn "open the plugin" into a hard error.
 *
 * 2026-09-20 addition (docs/dev/technical-design-review-hub.md §3.5): then runs
 * `migrateReviewSteps` the same way - the one-time move from the old
 * `lastReviewCompletedAt`/`lastReviewSummary` pair to per-step review
 * records. It needs the RAW parsed blob (those legacy keys are no longer part
 * of the typed settings), and follows the same same-reference-means-no-op,
 * write-back-once, swallow-write-failure contract.
 */
async function readSettings(): Promise<GtdParaSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  const parsed = raw ? JSON.parse(raw) : {};
  const merged: GtdParaSettings = {...DEFAULT_SETTINGS, ...parsed};
  const noteMigrated = migrateNoteTemplateDefaults(merged);
  const stepsMigrated = migrateReviewSteps(noteMigrated, parsed);
  // 2026-09-30 (docs/dev/technical-design-about-debug-experimental.md §3.1):
  // experimental switches + What's-new marker, same contract as above.
  const migrated = migrateExperimentalFlags(stepsMigrated, parsed, BUILD_INFO.version);
  if (migrated !== merged) {
    try {
      await saveSettings(migrated);
    } catch {
      // Best-effort - the migrated values still apply for the rest of this
      // session (they're returned below either way); they just aren't
      // persisted yet, so the next load re-derives them (both migrations are
      // idempotent - see their own doc comments).
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
