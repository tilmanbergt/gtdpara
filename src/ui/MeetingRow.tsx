/**
 * The one standard meeting row (docs/dev/technical-design-meeting-lists.md §2.3,
 * 2026-09-29) - used by every list that shows meetings: Daily, the day panel
 * (Week/Month), Project, Inbox, the Review steps and focus mode's "Coming up".
 *
 * - Two layouts with FIXED heights (MEETING_ROW_HEIGHT): `oneLine` 37 dp and
 *   `twoLine` 57 dp. No title-length estimation - a list pages by these
 *   constants (ui/MeetingList.tsx).
 * - `time`: 'time' for single-day lists, 'dateTime' ("29.9. 10:00") for lists
 *   spanning days - wording from domain/meetingDisplay.ts's meetingTimeCell.
 * - Every action is optional (source, highlight, tracking, note, file, tap),
 *   so a list switches features on/off by the props it passes instead of by
 *   having its own row.
 * - `state`: editing/arming/selected rows get a clear black 4 dp bar on the
 *   left (Tilman 2026-09-29: "clear black line, same everywhere").
 * - twoLine: line 2 shows the source; without a source a long title wraps
 *   onto line 2 instead. The M (highlight) only shows in twoLine rows, at the
 *   end with the other icons.
 *
 * The pre-2026-09-29 row (single-line with a `showSource` badge, per-title
 * height estimation via meetingRowSizing/meetingEntryHeight, a `compact`
 * variant) was removed in design step 9 once every caller had moved over.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {isContextTag} from '../domain/flowState';
import {splitTextWithTags} from '../domain/markdown';
import {MeetingTimeMode, meetingTimeCell} from '../domain/meetingDisplay';
import {isHighlight} from '../domain/monthHighlight';
import {MeetingSpanDay} from '../domain/meetingSpan';
import {meetingDisplayTitle, MeetingTrackingKind, resolveMeetingTracking} from '../domain/meetingTracking';
import HighlightMark from './HighlightMark';
import {TagRule} from '../domain/tagRules';
import {Meeting} from '../domain/types';
import {ClipIcon, TrackingBoxIcon} from './icons';
import {COLORS, FONT} from './theme';
import {perfCount} from '../utils/perf';

/**
 * What a screen supplies to switch a meeting list's prep/review icons on: the
 * Tag Rules (`settings.tagRules`) and its own persist step.
 * `onToggle(kind)` must flip the checkpoint on the CURRENT copy of the
 * meeting inside the screen's usual meetings mutator (domain/
 * meetingTracking.ts's `toggleMeetingTrackingAt`), not on the `meeting` the
 * row was rendered with, which may be a render behind. Pass the same object
 * to `MeetingRow`'s `tracking` prop.
 */
export interface MeetingTrackingConfig {
  rules: TagRule[];
  onToggle: (kind: MeetingTrackingKind) => void;
}

/** Segments `text` into plain runs and tappable tag spans - see ui/TaskRow.tsx's identical helper and module doc comment. */
function renderTaggableText(
  text: string,
  contextTag: string | null | undefined,
  onToggleContext: ((tag: string) => void) | undefined,
): React.ReactNode {
  if (!onToggleContext) return text;
  return splitTextWithTags(text).map((segment, index) => {
    if (segment.kind === 'text') return segment.value;
    if (!isContextTag(segment.value)) return `#${segment.value}`;
    const selected = segment.value === contextTag;
    return (
      <Text
        key={`tag-${index}`}
        onPress={() => onToggleContext(segment.value)}
        style={selected ? styles.tagSelected : styles.tag}>
        {`#${segment.value}`}
      </Text>
    );
  });
}

export type MeetingRowLayout = 'oneLine' | 'twoLine';

/** Rendered height per layout (dp) - the value every list passes to PagedSection's rowHeight. */
export const MEETING_ROW_HEIGHT: Record<MeetingRowLayout, number> = {oneLine: 37, twoLine: 57};

const TITLE_LINE_DP = 22;
const SUB_LINE_DP = 18;
/** Time-column widths (dp) so times line up down a list; see design §2.3. */
/** The time column's width - exported so ui/GoogleCalendarPanel.tsx's event rows line up with meeting rows. */
export const TIME_COLUMN_DP: Record<MeetingTimeMode, Record<MeetingRowLayout, number>> = {
  time: {oneLine: 58, twoLine: 58},
  // oneLine 118: "28.12. 23:59" in bold FONT.medium needs ~110 dp (104 cut two-digit days).
  dateTime: {oneLine: 118, twoLine: 96},
};

export interface MeetingRowProps {
  meeting: Meeting;
  /** One covered day of a multi-day meeting (domain/meetingSpan.ts) - drives the date, "day 2/3" and the ◂ ▸ arrows. */
  span?: MeetingSpanDay;
  layout: MeetingRowLayout;
  /** 'time' in single-day lists, 'dateTime' in lists spanning several days. */
  time: MeetingTimeMode;
  /** oneLine: bold "#abbrev" at the end of the line; twoLine: the full name on line 2. Both tap through to the item. Omit in single-item lists. */
  source?: {abbrev: string; name: string; onPress?: () => void};
  /** twoLine only (Tilman 2026-09-29: M "is not essential" in 1-line rows): 'mark' = read-only M, 'toggle' = tappable box. */
  highlight?: 'mark' | 'toggle';
  onToggleHighlight?: () => void;
  tracking?: MeetingTrackingConfig;
  note?: {onOpen: () => void; onCreate: () => void};
  /** `onArm` only where a Files pane exists to pick from (Project, Inbox, Review-inbox). */
  file?: {linkedFile: string; onOpen?: (linkedFile: string) => void; onArm?: () => void};
  /** Tap on the title: edit (most lists) or select (Review close-out). */
  onPress?: () => void;
  state?: 'editing' | 'arming' | 'selected' | 'done';
  /** Daily's context filter - see ui/TaskRow.tsx's identical props. */
  contextTag?: string | null;
  onToggleContext?: (tag: string) => void;
  textColor: string;
  borderColor: string;
}

function MeetingRowV2({
  meeting,
  span,
  layout,
  time,
  source,
  highlight,
  onToggleHighlight,
  tracking,
  note,
  file,
  onPress,
  state,
  contextTag,
  onToggleContext,
  textColor,
  borderColor,
}: MeetingRowProps): React.JSX.Element {
  const twoLine = layout === 'twoLine';
  const cell = meetingTimeCell(meeting, span, time);
  const continuesBefore = span?.part === 'middle' || span?.part === 'last';
  const continuesAfter = span?.part === 'first' || span?.part === 'middle';
  const trackingState = tracking ? resolveMeetingTracking(meeting, tracking.rules) : null;
  const highlighted = isHighlight(meeting);
  const done = state === 'done';

  // 2-line row without a source line (single-item lists): the title may use
  // both lines (Tilman 2026-09-29) - 2 x 21 dp fits the same 42 dp content box.
  const titleWraps = twoLine && !source;
  const title = (
    <Text style={[v2.title, titleWraps && v2.titleWrapped, {color: textColor}]} numberOfLines={titleWraps ? 2 : 1}>
      {done ? '✓ ' : ''}
      {continuesBefore ? '◂ ' : ''}
      {renderTaggableText(meetingDisplayTitle(meeting), contextTag, onToggleContext)}
      {continuesAfter ? ' ▸' : ''}
    </Text>
  );

  return (
    <View
      style={[
        v2.row,
        // Bottom border only: a whole-row `borderColor` could win over the
        // marked row's black left bar and grey it out (Tilman 2026-09-29).
        {borderBottomColor: borderColor, height: MEETING_ROW_HEIGHT[layout]},
        twoLine ? v2.rowTwo : v2.rowOne,
        (state === 'editing' || state === 'arming' || state === 'selected') && v2.rowMarked,
        state === 'selected' && v2.rowSelected,
        done && v2.rowDone,
      ]}>
      <Pressable onPress={onPress} disabled={!onPress} style={v2.main}>
        <View style={[v2.timeCol, {width: TIME_COLUMN_DP[time][layout]}]}>
          <Text style={[v2.time, {color: textColor}]} numberOfLines={1}>
            {twoLine ? cell.line1 : cell.oneLine}
          </Text>
          {twoLine && !!cell.line2 && (
            <Text style={[v2.sub, {color: textColor}]} numberOfLines={1}>
              {cell.line2}
            </Text>
          )}
        </View>
        <View style={v2.body}>
          {twoLine ? (
            <>
              {title}
              {source && (
                <Text onPress={source.onPress} style={[v2.sub, {color: textColor}]} numberOfLines={1}>
                  {source.name}
                </Text>
              )}
            </>
          ) : (
            <View style={v2.oneLineBody}>
              <View style={v2.flex}>{title}</View>
              {source && (
                <Text onPress={source.onPress} style={[v2.abbrev, {color: textColor}]} numberOfLines={1}>
                  #{source.abbrev}
                </Text>
              )}
            </View>
          )}
        </View>
      </Pressable>
      {/* M sits with the other icons at the end of the row (Tilman 2026-09-29), 2-line rows only. */}
      {twoLine && highlight === 'toggle' && (
        <View style={[v2.action, v2.actionTwo]}>
          <HighlightMark on={highlighted} variant="toggle" onPress={onToggleHighlight} textColor={textColor} />
        </View>
      )}
      {twoLine && highlight === 'mark' && highlighted && (
        <View style={[v2.action, v2.actionTwo]}>
          <HighlightMark on variant="row" textColor={textColor} />
        </View>
      )}
      {tracking && trackingState && (
        <Pressable onPress={() => tracking.onToggle(trackingState.kind)} hitSlop={8} style={[v2.action, twoLine && v2.actionTwo]}>
          <TrackingBoxIcon kind={trackingState.kind} done={trackingState.done} color={textColor} />
        </Pressable>
      )}
      {note && (
        <Pressable onPress={meeting.notePath ? note.onOpen : note.onCreate} hitSlop={8} style={[v2.action, twoLine && v2.actionTwo]}>
          <Text style={[v2.noteText, {color: textColor}]}>{meeting.notePath ? '📓' : '+📓'}</Text>
        </Pressable>
      )}
      {file && file.linkedFile ? (
        <Pressable onPress={() => file.onOpen?.(file.linkedFile)} hitSlop={8} style={[v2.action, twoLine && v2.actionTwo]}>
          <ClipIcon color={textColor} />
        </Pressable>
      ) : file?.onArm ? (
        <Pressable onPress={file.onArm} hitSlop={8} style={[v2.action, twoLine && v2.actionTwo]}>
          <Text style={[v2.plus, {color: textColor}]}>+</Text>
          <ClipIcon color={textColor} />
        </Pressable>
      ) : null}
    </View>
  );
}

const v2 = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: 7,
  },
  rowOne: {alignItems: 'center'},
  rowTwo: {alignItems: 'flex-start'},
  // Editing/arming/selected: a clear black 4 dp bar on the left.
  rowMarked: {
    borderLeftWidth: 4,
    borderLeftColor: '#000000',
    paddingLeft: 4,
  },
  rowSelected: {backgroundColor: '#e8e8e8'},
  rowDone: {opacity: 0.5},
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timeCol: {marginRight: 8},
  time: {
    fontSize: FONT.medium,
    lineHeight: TITLE_LINE_DP,
    fontWeight: '700',
    includeFontPadding: false,
  },
  body: {flex: 1},
  oneLineBody: {flexDirection: 'row', alignItems: 'center'},
  flex: {flex: 1},
  title: {
    fontSize: FONT.medium,
    lineHeight: TITLE_LINE_DP,
    includeFontPadding: false,
  },
  titleWrapped: {lineHeight: 21},
  sub: {
    fontSize: FONT.small,
    lineHeight: SUB_LINE_DP,
    opacity: 0.6,
    marginTop: 2,
    includeFontPadding: false,
  },
  abbrev: {
    fontSize: FONT.small,
    lineHeight: TITLE_LINE_DP,
    fontWeight: '700',
    marginLeft: 8,
    includeFontPadding: false,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    height: TITLE_LINE_DP,
    marginLeft: 8,
    paddingHorizontal: 4,
  },
  // 2-line rows: icons centred over both lines.
  actionTwo: {height: TITLE_LINE_DP + 2 + SUB_LINE_DP},
  noteText: {fontSize: FONT.small, includeFontPadding: false},
  plus: {fontSize: FONT.small, fontWeight: '700', marginRight: 1},
});

/** The standard meeting row - see the module doc comment. */
export default function MeetingRow(props: MeetingRowProps): React.JSX.Element {
  perfCount('row:meeting');
  return <MeetingRowV2 {...props} />;
}

const styles = StyleSheet.create({
  tag: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  tagSelected: {
    color: COLORS.accentText,
    fontWeight: '600',
    backgroundColor: COLORS.accent,
    borderRadius: 4,
    paddingHorizontal: 3,
  },
});
