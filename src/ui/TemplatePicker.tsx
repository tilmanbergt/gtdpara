/**
 * Background-template picker: a `.png` filename list found in
 * `supernote/fileSystem.ts`'s `MYSTYLE_FOLDER`, with a ●/○ selection dot and
 * a "None (blank note)" choice pinned above it. Extracted out of
 * screens/Settings.tsx's "Meeting Note" tab (2026-09-18, docs/technical-
 * design-note-templates.md §6) so the new "Templates" tab's background field
 * can use the exact same picker rather than a second hand-copy - the Meeting
 * Note tab was refactored to call this too, not left with its own inline
 * duplicate.
 *
 * Paginated via `ui/PagedSection.tsx` (2026-09-18 revision - Tilman: "I
 * don't want the template to be a scrollView... not good for eink"; see
 * docs/dev/design-device-rendering.md §1's "no scrolling, anywhere, by design").
 * A MyStyle folder can hold arbitrarily many `.png`s, so an unbounded list
 * here would be exactly the kind of growing-region-on-e-ink case that rule
 * exists to prevent. Fixed `viewportHeight`, not self-measuring - both call
 * sites (this tab's own field, the Meeting Note tab's field) sit in ordinary
 * top-down flow, not a bounded flex column, so self-measuring mode's
 * precondition (PagedSection's own doc comment) doesn't hold here.
 *
 * Deliberately still a plain-text list, no thumbnail preview - the Meeting
 * Note tab's own doc comment already named that a deferred v2 (docs/
 * technical-design-meeting-notes.md §7: "v1 lists MyStyle's .png filenames
 * as plain text choices"), and nothing about this feature changes that
 * call. Update (2026-09-18): local-file `<Image>` loading is no longer
 * unexercised ground - screens/Settings.tsx's "Choose background" page
 * (the Templates tab's full browse page, not this compact field) now
 * renders the actual selected PNG via `<Image source={{uri:
 * 'file://'+path}}}>`, docs/dev/technical-design-note-templates.md §7 Phase 5
 * item #1. This picker still stays plain text on purpose though - it's a
 * small, height-capped inline field (also used by the Meeting Note tab),
 * not the one-image "what did I pick" preview the browse page's dedicated
 * preview box already covers; a thumbnail per row here is a separate,
 * still-open cost/perf question (many full-page-resolution decodes at
 * once) rather than a "does it work" one.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {MYSTYLE_FOLDER} from '../supernote/fileSystem';
import PagedSection from './PagedSection';
import {FONT} from './theme';

interface Props {
  /** '' = blank/no template picked. */
  value: string;
  onChange: (fileName: string) => void;
  /** From Settings.tsx's shared, once-on-mount MyStyle listing - null while loading, [] once loaded with nothing found. */
  pngs: string[] | null;
  error: string | null;
  textColor: string;
  borderColor: string;
}

// Compact list row (§5.2 of the device-rendering doc's ~33-41px convention)
// and a row-COUNT cap - the same `PAGE_SIZE`-style "plain integer row
// count" idiom `ui/pagination.ts` uses everywhere else (Tilman, 2026-09-18:
// "use normal pagination here from other pages"), not a fixed pixel guess.
// The viewport height is then derived from however many rows actually exist
// this call, up to the cap, so a folder with just 2 backgrounds gets a
// 2-row box instead of a fixed-size box with empty space in it ("self
// adjusting... will shrink as much as needed") - it only grows to the full
// `TEMPLATE_MAX_VISIBLE_ROWS` (and starts paginating via the arrows) once
// there are enough backgrounds to fill it.
const TEMPLATE_ROW_HEIGHT = 34;
const TEMPLATE_MAX_VISIBLE_ROWS = 4;

export default function TemplatePicker({value, onChange, pngs, error, textColor, borderColor}: Props): React.JSX.Element {
  const visibleRowCount = Math.max(1, Math.min(pngs?.length ?? 0, TEMPLATE_MAX_VISIBLE_ROWS));

  return (
    <View>
      <Pressable onPress={() => onChange('')} hitSlop={8} style={styles.row}>
        <Text style={[styles.rowText, {color: textColor}]}>
          {value === '' ? '● ' : '○ '}None (blank note)
        </Text>
      </Pressable>
      {error && <Text style={styles.errorText}>⚠ Could not list MyStyle: {error}</Text>}
      {pngs === null && !error ? (
        <Text style={[styles.hintText, {color: textColor}]}>Loading…</Text>
      ) : (
        <PagedSection<string>
          header="MyStyle backgrounds"
          rows={pngs ?? []}
          rowHeight={() => TEMPLATE_ROW_HEIGHT}
          viewportHeight={visibleRowCount * TEMPLATE_ROW_HEIGHT}
          emptyHint={`No .png files found in ${MYSTYLE_FOLDER}.`}
          renderRow={fileName => (
            <Pressable key={fileName} onPress={() => onChange(fileName)} hitSlop={8} style={styles.row}>
              <Text style={[styles.rowText, {color: textColor}]} numberOfLines={1}>
                {value === fileName ? '● ' : '○ '}
                {fileName}
              </Text>
            </Pressable>
          )}
          textColor={textColor}
          borderColor={borderColor}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 6,
  },
  rowText: {
    fontSize: FONT.medium,
  },
  hintText: {
    fontSize: FONT.small,
    opacity: 0.6,
    marginTop: 4,
  },
  errorText: {
    fontSize: FONT.small,
    marginTop: 4,
  },
});
