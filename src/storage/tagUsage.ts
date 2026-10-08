import AsyncStorage from '@react-native-async-storage/async-storage';
import {inactiveLeaves} from '../domain/counterparts';
import {threadOf} from '../domain/threads';
import {getCachedData} from './dataCache';
import {onActiveProfileChange, profileScopedKey} from './profileKeys';

const TAG_USAGE_KEY = 'gtdpara:tagUsage:v1';
const MAX_TAGS = 30;

/**
 * One tag's "last applied" bookkeeping (technical-design-context-tags.md
 * §5). Tags themselves have no timestamp anywhere in a project/area file -
 * this is the plugin-internal record that makes "most recently used tags
 * first" possible in ui/QuickAddWidget.tsx's Row 3. Plugin-internal UI
 * state, not PARA content (nobody needs to hand-edit this outside the
 * plugin), so it follows storage/settingsStorage.ts's AsyncStorage
 * convention exactly rather than living in a project/area file.
 */
interface TagUsageEntry {
  tag: string;
  lastUsedAt: number;
}

async function loadEntries(): Promise<TagUsageEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(profileScopedKey(TAG_USAGE_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveEntries(entries: TagUsageEntry[]): Promise<void> {
  await AsyncStorage.setItem(profileScopedKey(TAG_USAGE_KEY), JSON.stringify(entries));
}

/**
 * Records `tags` as just-applied - move-to-front, deduped, capped at
 * `MAX_TAGS`. Called once per successful Task/Meeting add or edit save from
 * inside ui/QuickAddWidget.tsx's existing submit `.then()` chains, with tags
 * already extracted from the just-saved text and filtered through
 * domain/flowState.ts's `isContextTag` - so this never needs to know that
 * filtering rule itself, it just records whatever it's given. A tag typed
 * by hand and a tag tapped in from a suggestion chip are recorded exactly
 * the same way - both count as "applied" (the chat decision this bookkeeping
 * was worth the cost hinged on that). No-ops on an empty/all-blank list
 * rather than writing a no-op change to storage.
 */
export async function recordTagsUsed(tags: string[]): Promise<void> {
  const unique = Array.from(new Set(tags.filter(tag => tag.length > 0)));
  if (unique.length === 0) return;
  const existing = await loadEntries();
  const now = Date.now();
  const remainder = existing.filter(entry => !unique.includes(entry.tag));
  const fresh: TagUsageEntry[] = unique.map(tag => ({tag, lastUsedAt: now}));
  await saveEntries([...fresh, ...remainder].slice(0, MAX_TAGS));
}

/**
 * `tags` without the counterparts set inactive (docs/dev/history/technical-design-tending-threads.md
 * §1.3): their nested tags (`#101/sven`) and plain leaf (`#sven`) are no
 * longer suggested. Read from the cache at call time; without a cache
 * nothing is left out.
 */
function withoutInactive(tags: string[]): string[] {
  const items = getCachedData()?.items;
  if (!items) return tags;
  const hidden = inactiveLeaves(items.filter(item => !item.loadError));
  if (hidden.size === 0) return tags;
  return tags.filter(tag => !hidden.has(threadOf(tag)?.counterpart ?? tag));
}

/** Most-recently-used tags first, inactive counterparts left out, up to `limit` (default: every tag this store keeps). Empty array, never throws, if nothing's been recorded yet or storage is unavailable - same "try/catch to a safe default" posture as storage/settingsStorage.ts's loadSettings. */
export async function getRecentTags(limit = MAX_TAGS): Promise<string[]> {
  const entries = await loadEntries();
  const all = entries.map(entry => entry.tag);
  lastKnownRecent = all;
  return withoutInactive(all).slice(0, limit);
}

/**
 * The list the last getRecentTags() call returned (all tags, most recent
 * first), or null if none has completed yet this session. Lets
 * ui/QuickAddWidget.tsx start with the right chips instead of rendering
 * once empty and again when the async read lands
 * (docs/dev/history/technical-design-render-perf-ab.md §3 A1).
 */
export function getRecentTagsSync(limit = MAX_TAGS): string[] | null {
  return lastKnownRecent ? withoutInactive(lastKnownRecent).slice(0, limit) : null;
}

let lastKnownRecent: string[] | null = null;

// Recent tags are per profile (docs/dev/history/technical-design-profiles-demo-space.md §3.3).
onActiveProfileChange(() => {
  lastKnownRecent = null;
});
