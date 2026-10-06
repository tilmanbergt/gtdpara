/**
 * ItemsList — Projects/Areas top-level tabs (App.tsx). Two-column layout
 * (docs/dev/technical-design-pagination-fixed-height.md §3.5, Batch 4,
 * 2026-09-15): left column "Active" (its own `PagedSection`), right column
 * split top/bottom into "On Hold" and "Done — awaiting review" (Projects),
 * or just "On Hold" alone filling the whole right column (Areas — matches
 * `groupByStatus`'s existing "Areas get no Done group" rule). Replaces the
 * old single full-width `PageControls`-paginated list that flattened all
 * three status groups into one `FlatRow` sequence — with each group now
 * its own independent `PagedSection` (which renders its own header), that
 * flattening/union type isn't needed at all any more; `groupByStatus`
 * returns a plain `{active, onHold, done}` triple instead.
 *
 * Every group's box renders unconditionally at its fixed `viewportHeight`,
 * even with zero items — `PagedSection`'s own `emptyHint` fills the box
 * instead ("Nothing active."/"Nothing on hold."/"Nothing done yet."),
 * unlike the old `groupByStatus`, which filtered empty groups out of the
 * sequence entirely. This is §1.3's general fixed-height guarantee applied
 * here: the right column's two halves are always exactly half its height
 * each, never reflowing based on whether either currently has anything.
 *
 * Tapping an entry hands it to `onOpenItem`, which App.tsx wires to set the
 * "Current" tab's item and switch to it.
 *
 * No heading or refresh button of its own. If no cache exists yet when it
 * mounts, it builds one; otherwise "Reload all files" in Settings → Advanced
 * re-reads everything (docs/dev/technical-design-cleanup-0.5.md S8).
 *
 * Grouped by status (technical-design-status-archive.md §7): Active, then
 * On Hold, then - Projects only - "Done — awaiting review". Within Active,
 * items currently in daily or weekly focus float to the top (★ prefix) -
 * domain/destination.ts's exported `isFocused`, the same "focused floats to
 * the top" rule destinationCandidates applies to the create-menus'
 * destination pickers, applied here too for consistency rather than as a
 * picker-only special case. On Hold/Done need no such sort (nothing there
 * can be focused - see storage/statusControl.ts). Archived items simply
 * aren't in `cache.items` at all - their folder isn't under Projects/Areas
 * any more once storage/archive.ts has moved it.
 *
 * Row height (`itemEntryLines`/`itemEntryHeight` below) mirrors ui/
 * TaskRow.tsx's `taskRowHeight`/ui/FileBrowserPane.tsx's `fileEntryHeight`
 * exactly - same `activeLineEstimator`, same FONT.medium/22px-line-height
 * convention - since a long project/area name (plus the ★/› decoration)
 * can wrap to a second line, same as those. This screen already capped
 * entries at `numberOfLines={2}` before this pass, but had no computed
 * height to match under the old fixed-row-count pagination (a real but
 * harmless gap, since a fixed row count didn't care about individual row
 * height) - now that pagination is height-driven, the two have to agree.
 *
 * Viewport-height constant (`FULL_VIEWPORT_PX`) is a fresh screen budget
 * (docs/dev/design-device-rendering.md §6's method) rather than carried over
 * from the old `PAGE_SIZE.full` - this is the first call site in this pass
 * that's an actual layout change, not just a chrome swap (design doc §8
 * point 3), so there's no old per-list pixel budget to preserve the way
 * earlier batches preserved theirs. A starting point, same "tune once
 * on-device" convention as every other constant in this pass. Still used
 * by the Areas tab's lone "On Hold" box (§ below) - the Projects tab's own
 * right column no longer needs a matching `HALF_VIEWPORT_PX` (removed
 * 2026-09-17, docs/dev/technical-design-flex-weight-stacking.md §3.2): its
 * On Hold/Done split is now an equal 1:1 `flex` weight, not a shared pixel
 * budget - see `columnRight`'s own render comment.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {StyleSheet, Pressable, Text, View} from 'react-native';
import {isFocused} from '../domain/destination';
import {FolderEntry} from '../supernote/fileSystem';
import {CachedItem, DataCache, getCacheVersion, getCachedData, rebuildCache} from '../storage/dataCache';
import {useOnScreenShow} from '../ui/screenActivity';
import {createItem} from '../storage/createItem';
import {loadSettings} from '../storage/settingsStorage';
import {log} from '../utils/log';
import {useEinkRefreshOnLoad} from '../utils/screenRefresh';
import ClipboardTextInput from '../ui/ClipboardTextInput';
import PagedSection from '../ui/PagedSection';
import {
  ABBREV_GAP,
  COLUMN_WIDTH_PX,
  ItemEntryOptions,
  itemEntryAbbrevLabel,
  itemEntryHeight,
  itemEntryLines,
} from '../ui/itemEntryRow';
import {common} from '../ui/commonStyles';
import {COLORS, FONT, useThemeColors} from '../ui/theme';
import {useErrorStatus} from '../ui/status/StatusProvider';

const CREATE_LABEL: Record<'project' | 'area', string> = {
  project: '+ Create Project',
  area: '+ Create Area',
};

const CREATE_PLACEHOLDER: Record<'project' | 'area', string> = {
  project: 'New project name',
  area: 'New area name',
};

// Two-column width (COLUMN_WIDTH_PX) and row-sizing helpers
// (itemEntryHeight/itemEntryLines) now live in ui/itemEntryRow.ts (extracted
// 2026-09-16, docs/dev/technical-design-review-master-detail.md) so Review's
// master-detail left lists can render rows with identical sizing/display
// logic instead of a second copy.

// The Projects/Areas tabs show each entry's abbreviation and give rows a bit
// more room than Review's lists (docs/dev/technical-design-waiting-for-0.7.md
// P1/P2: 8 px padding instead of 6, 38 px instead of 34 per one-line row,
// against wrong taps). ENTRY_PADDING_PX and styles.entryRow must match.
const ENTRY_PADDING_PX = 8;
const ENTRY_OPTS: ItemEntryOptions = {showAbbrev: true, paddingPx: ENTRY_PADDING_PX};
const entryHeight = (item: CachedItem) => itemEntryHeight(item, COLUMN_WIDTH_PX, ENTRY_OPTS);

// --- Fresh screen budget for this screen's two-column area (docs/dev/design-
// device-rendering.md §6) ---
// Tab bar (~80) + screen content top padding (16), present on every screen.
const GLOBAL_CHROME_PX = 96;
// This screen's own create-row (name field + button) above the columns -
// ui/ClipboardTextInput.tsx's input (paddingVertical 5x2 + borderWidth 1x2
// + FONT.medium line ~21 = 33) is the taller sibling vs. the create button,
// plus this row's own marginBottom (12).
const CREATE_ROW_PX = 33 + 12;
// Every PagedSection's own header row (ui/PagedSection.tsx's
// styles.headerRow): paddingVertical 4x2 + FONT.small line ~18 +
// marginBottom 4 + borderBottomWidth 1.
const SECTION_HEADER_ROW_PX = 8 + 18 + 4 + 1;
// Vertical gap between the right column's two stacked halves (On Hold /
// Done) - SPACING.md (12px), same gap this screen's own createRow uses
// below itself.
const HALF_BOX_GAP_PX = 12;

// Both columns share the same vertical bounds (design-device-rendering.md
// §6 point 4) - the height available to either column's own PagedSection(s),
// below the global chrome and this screen's create-row.
const COLUMN_BUDGET_PX = 1872 - GLOBAL_CHROME_PX - CREATE_ROW_PX; // ≈ 1731
// "Active" (left column) and the Areas tab's lone "On Hold" (right column,
// unsplit) are both a single full-height PagedSection.
const FULL_VIEWPORT_PX = COLUMN_BUDGET_PX - SECTION_HEADER_ROW_PX; // ≈ 1700

interface Props {
  kind: 'project' | 'area';
  onOpenItem: (kind: 'project' | 'area', entry: FolderEntry) => void;
}

const TITLES: Record<'project' | 'area', string> = {
  project: 'Projects',
  area: 'Areas',
};

const PATH_KEYS: Record<'project' | 'area', 'projects' | 'areas'> = {
  project: 'projects',
  area: 'areas',
};

interface StatusGroups {
  active: CachedItem[];
  onHold: CachedItem[];
  done: CachedItem[];
}

/**
 * Splits `entries` (already filtered to one `kind`) into the status groups
 * this screen renders, each its own `PagedSection` now (§3.5) - no longer
 * filtered down to only non-empty groups, since every group's box shows
 * unconditionally (its own `emptyHint` fills an empty one). Areas get no
 * "Done" group - see domain/types.ts's ItemStatus doc comment. Active items
 * currently focused sort first; Array.prototype.sort is stable, so the
 * rest keep whatever order they arrived in (the native folder listing's own
 * case-insensitive alphabetical order).
 */
function groupByStatus(kind: 'project' | 'area', entries: CachedItem[]): StatusGroups {
  const active = entries
    .filter(item => item.status === 'active')
    .slice()
    .sort((a, b) => Number(isFocused(b)) - Number(isFocused(a)));
  const onHold = entries.filter(item => item.status === 'on-hold');
  const done = kind === 'project' ? entries.filter(item => item.status === 'done') : [];
  return {active, onHold, done};
}

export default function ItemsList({kind, onOpenItem}: Props): React.JSX.Element {
  const {textColor, borderColor, placeholderColor} = useThemeColors();

  const [cache, setCache] = useState<DataCache | null>(() => getCachedData());
  // Kept tab shown again (docs/dev/technical-design-keep-tabs-alive.md §5.1):
  // this screen holds a snapshot of the cache from mount - pick up whatever
  // changed while hidden (rebuild on reopen, status changes, new items),
  // re-rendering only if the cache version moved.
  const shownVersionRef = useRef(getCacheVersion());
  useOnScreenShow(() => {
    const version = getCacheVersion();
    if (version === shownVersionRef.current) return;
    shownVersionRef.current = version;
    const current = getCachedData();
    setCache(current ? {...current} : null);
  });
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Create Project/Area row (2026-09-11) - name field + button at the very
  // top of this screen. Deliberately separate from `error` above (which is
  // the manual-rebuild failure state) so a failed create doesn't also show
  // the "Not built yet"/rebuild messaging.
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  useErrorStatus('ItemsList.createError', createError, () => setCreateError(null));
  // Explicit e-ink refresh once a manual rebuild actually lands - see
  // src/utils/screenRefresh.ts.
  useEinkRefreshOnLoad(scanning);

  const handleRebuild = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const settings = await loadSettings();
      const next = await rebuildCache(settings);
      setCache(next);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log('ItemsList: rebuild failed', message);
      setError(message);
    } finally {
      setScanning(false);
    }
  }, []);

  // No cache yet (nothing has built it this session): build it now, instead
  // of asking the user to trigger it.
  useEffect(() => {
    if (!getCachedData()) handleRebuild();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Create Project/Area (2026-09-11, storage/createItem.ts). Deliberately
   * doesn't navigate into the new item afterward (chat decision) - it just
   * clears the name field and lets the new item show up in its Active
   * group, same as any other item. If a cache already exists,
   * createItem's own ensureItemCached call pushes the new item straight
   * into it (mutating the same cache object createItem read `getCachedData`
   * from) - `setCache` below only needs to hand React a *new* top-level
   * object so it notices, not rebuild anything. If no cache exists yet
   * (never scanned), ensureItemCached has nowhere to store the new item at
   * all (see its own doc comment), so a full rebuild runs instead - this
   * also picks up the freshly-created folder from disk, same as tapping 🔄.
   */
  const handleCreate = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const settings = await loadSettings();
      const hadCache = getCachedData() !== null;
      await createItem(kind, newName, settings);
      setNewName('');
      if (hadCache) {
        setCache(prev => (prev ? {...prev} : prev));
      } else {
        const next = await rebuildCache(settings);
        setCache(next);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log('ItemsList: create failed', kind, message);
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  }, [kind, newName, creating]);

  const pathKey = PATH_KEYS[kind];
  const entries = cache ? cache.items.filter(item => item.kind === kind) : [];
  const groups = groupByStatus(kind, entries);

  const renderEntry = (item: CachedItem): React.ReactNode => {
    const heightPx = entryHeight(item);
    const abbrev = itemEntryAbbrevLabel(item, ENTRY_OPTS);
    return (
      <Pressable
        key={item.path}
        onPress={() => onOpenItem(kind, {name: item.name, path: item.path, isFolder: true})}
        // {height, minHeight: height} together, not height alone - an
        // explicit height doesn't override a stylesheet minHeight floor on
        // its own (ui/TaskRow.tsx's Batch-2-bugfix-round doc comment has
        // the full story) - this row has no such floor today, but pairing
        // them defensively keeps this row consistent with every other
        // computed-height row in the app.
        style={[styles.entryRow, {height: heightPx, minHeight: heightPx}]}>
        <Text
          style={[styles.entry, styles.entryLink, {color: textColor}]}
          numberOfLines={itemEntryLines(item, COLUMN_WIDTH_PX, ENTRY_OPTS)}>
          {isFocused(item) ? '★ ' : ''}
          {item.name}
          {abbrev ? ABBREV_GAP : ''}
          {abbrev ? <Text style={styles.entryAbbrev}>{abbrev}</Text> : null} ›
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={common.container}>
      <View style={styles.createRow}>
        <ClipboardTextInput
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={handleCreate}
          placeholder={CREATE_PLACEHOLDER[kind]}
          placeholderColor={placeholderColor}
          textColor={textColor}
          borderColor={borderColor}
          editable={!creating}
        />
        <Pressable
          style={[styles.createButton, creating && styles.createButtonDisabled]}
          onPress={handleCreate}
          disabled={creating}
          hitSlop={8}>
          <Text style={styles.createButtonText}>{creating ? '…' : CREATE_LABEL[kind]}</Text>
        </Pressable>
      </View>

      {error && (
        <Text style={[styles.error, {color: textColor}]}>⚠ {error}</Text>
      )}

      {!cache && !scanning && !error && (
        <Text style={[styles.empty, {color: textColor}]}>
          Not loaded yet. Settings → Advanced → Reload all files scans your {TITLES[kind]} folder.
        </Text>
      )}

      {cache && entries.length === 0 && (
        <Text style={[styles.empty, {color: textColor}]}>
          No folders found under {cache.paths[pathKey]}
        </Text>
      )}

      {cache && entries.length > 0 && (
        <View style={styles.twoColumn}>
          <View style={styles.columnLeft}>
            {/* Self-measured (2026-09-17, [[feature_pagination_fixed_height]]) -
                `viewportHeight` deliberately omitted: this is the only thing
                in columnLeft (flex:1, common.container's own flex:1 chain
                above it), so ui/PagedSection.tsx's own flex:1+onLayout gets
                exactly this column's real available height instead of
                FULL_VIEWPORT_PX's hand-derived estimate. columnRight's
                'area'-kind branch is left on FULL_VIEWPORT_PX for now,
                rather than have the same JSX self-measure differently by
                kind - it stays the odd one out on purpose (see that
                branch's own comment). */}
            <PagedSection
              header="Active"
              rows={groups.active}
              rowHeight={entryHeight}
              renderRow={renderEntry}
              emptyHint="Nothing active."
              textColor={textColor}
              borderColor={borderColor}
            />
          </View>
          <View style={styles.columnRight}>
            {kind === 'project' ? (
              // Flex-weight split (2026-09-17, docs/dev/technical-design-flex-
              // weight-stacking.md §3.2) - "On Hold"/"Done" each claim an
              // equal `flex:1` share of columnRight (itself flex:1) instead
              // of both being told the same hand-derived HALF_VIEWPORT_PX;
              // each PagedSection now self-measures (`viewportHeight`
              // omitted) into its own weighted box. Reproduces the old
              // 1:1 split exactly - HALF_VIEWPORT_PX was already the same
              // value for both.
              <>
                <View style={styles.halfBoxTop}>
                  <PagedSection
                    header="On Hold"
                    rows={groups.onHold}
                    rowHeight={entryHeight}
                    renderRow={renderEntry}
                    emptyHint="Nothing on hold."
                    textColor={textColor}
                    borderColor={borderColor}
                  />
                </View>
                <View style={styles.halfBoxBottom}>
                  <PagedSection
                    header="Done — awaiting review"
                    rows={groups.done}
                    rowHeight={entryHeight}
                    renderRow={renderEntry}
                    emptyHint="Nothing done yet."
                    textColor={textColor}
                    borderColor={borderColor}
                  />
                </View>
              </>
            ) : (
              // Deliberately still on the explicit FULL_VIEWPORT_PX
              // constant rather than self-measuring (which columnRight's
              // flex:1/sole-occupant shape would otherwise make eligible
              // for, same as columnLeft above) - kept as-is per the
              // 2026-09-17 self-measuring pass note this branch already
              // carried, out of scope for this flex-weight pass too.
              <PagedSection
                header="On Hold"
                rows={groups.onHold}
                rowHeight={entryHeight}
                viewportHeight={FULL_VIEWPORT_PX}
                renderRow={renderEntry}
                emptyHint="Nothing on hold."
                textColor={textColor}
                borderColor={borderColor}
              />
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  error: {
    marginBottom: 16,
    fontSize: FONT.medium,
  },
  empty: {
    fontSize: FONT.small,
    opacity: 0.6,
  },
  twoColumn: {
    flexDirection: 'row',
    flex: 1,
  },
  columnLeft: {
    flex: 1,
    marginRight: 16,
  },
  columnRight: {
    flex: 1,
  },
  // Equal 1:1 flex-weight split (docs/dev/technical-design-flex-weight-
  // stacking.md §3.2) - both boxes flex:1 inside columnRight (itself
  // flex:1), so RN's own flexbox proportional-splitting gives each half of
  // columnRight's real available height, same value HALF_VIEWPORT_PX used
  // to hand-compute for both.
  halfBoxTop: {
    flex: 1,
    marginBottom: HALF_BOX_GAP_PX,
  },
  halfBoxBottom: {
    flex: 1,
  },
  entryRow: {
    // No alignItems/justifyContent override - default column-flex top-
    // alignment is exactly what's wanted here (ui/TaskRow.tsx's/ui/
    // MeetingRow.tsx's Batch-2-bugfix-round lesson: centering a
    // variable-height row inside its own reserved box makes a
    // shorter-than-reserved row visually "float" instead of sitting at the
    // top with any misprediction slack at the bottom).
    paddingVertical: ENTRY_PADDING_PX,
  },
  entry: {
    fontSize: FONT.medium,
    // Test (2026-09-17, [[feature_pagination_fixed_height]]) - Tilman
    // noticed descenders (the bottom of a "g") getting clipped exactly at
    // the entryRow/entryRow boundary, with visible unused headroom above
    // the glyphs - consistent with Android's default `includeFontPadding`
    // (true) reserving extra space above cap-height for arbitrary-script
    // accents without a matching reservation below the baseline for
    // descenders, rather than entryRow's own fixed-height budget
    // (itemEntryHeight/ITEM_ENTRY_LINE_HEIGHT_PX) being short overall.
    // `false` asks Android to lay text out tight to its real ascent/
    // descent metrics instead. Scoped to Projects/Areas (this file) only,
    // to see the effect before deciding whether to roll it out to
    // TaskRow.tsx/MeetingRow.tsx/FileBrowserPane.tsx's own row Text
    // styles, which share the same unset-includeFontPadding default today.
    includeFontPadding: false,
  },
  entryLink: {
    fontWeight: '500',
  },
  // The abbreviation reads as a tag after the name: smaller, normal weight.
  entryAbbrev: {
    fontSize: FONT.small,
    fontWeight: '400',
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  createButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 6,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: FONT.small,
    fontWeight: '600',
  },
});
