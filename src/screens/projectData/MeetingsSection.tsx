/**
 * The Meetings list of the Current page's right pane (screens/ProjectDataPanel.tsx):
 * Upcoming above Past in one MeetingList, with its own row actions (note,
 * prep/review tracking), behind a Meetings | Google mini-tab. Add, edit and
 * delete live in ProjectDataPanel's single Quick Add above both lists.
 */
import React, {useEffect, useState} from 'react';
import {Keyboard, View} from 'react-native';
import {Meeting} from '../../domain/types';
import {splitAndSortMeetings} from '../../domain/meetingTime';
import {MeetingTrackingKind, toggleMeetingTrackingAt} from '../../domain/meetingTracking';
import {TagRule} from '../../domain/tagRules';
import {CachedItem, getCachedData} from '../../storage/dataCache';
import {openOrCreateMeetingNote} from '../../storage/meetingNoteContent';
import {loadSettings} from '../../storage/settingsStorage';
import {useNoteCreateConfirm} from '../../ui/useNoteCreateConfirm';
import GoogleCalendarPanel from '../../ui/GoogleCalendarPanel';
import MeetingRow, {MeetingTrackingConfig} from '../../ui/MeetingRow';
import MeetingList, {MeetingListHeaderRow} from '../../ui/MeetingList';
import MiniTabs, {MiniTabDef} from '../../ui/MiniTabs';
import {useFeatures, visibleTabs} from '../../ui/featureStore';
import {useErrorStatus} from '../../ui/status/StatusProvider';
import {log, logError} from '../../utils/log';
import {requestEinkRefresh} from '../../utils/screenRefresh';
import {errorMessage} from '../../utils/errorMessage';
import {PaneColors, sectionStyles as styles} from './panelLayout';

type MeetingsMainTab = 'meetings' | 'google';
const MEETINGS_MAIN_TABS: MiniTabDef<MeetingsMainTab>[] = [
  {key: 'meetings', label: 'Meetings'},
  {key: 'google', label: 'Google'},
];

export default function MeetingsSection({
  kind,
  name,
  itemPath,
  meetings,
  onSave,
  onOpenCalendarSettings,
  editingIndex,
  armingIndex,
  onStartEdit,
  onArmLink,
  onOpenLinkedFile,
  textColor,
  borderColor,
  placeholderColor,
}: PaneColors & {
  kind: 'project' | 'area';
  name: string;
  itemPath: string;
  meetings: Meeting[];
  onSave: (next: Meeting[]) => Promise<void>;
  onOpenCalendarSettings?: () => void;
  /** Lifted up into ProjectDataPanel (technical-design-linked-files.md §8) - see that component's EditTarget doc comment and TodosSection's identical props. Add/edit/delete itself lives in the single QuickAddWidget above both sections (docs/dev/history/technical-design-unified-quickadd.md §8) - see TodosSection's identical note. */
  editingIndex: number | null;
  armingIndex: number | null;
  onStartEdit: (index: number) => void;
  onArmLink: (index: number) => void;
  onOpenLinkedFile: (linkedFile: string) => void;
}): React.JSX.Element {
  const [actionError, setActionError] = useState<string | null>(null);
  useErrorStatus('ProjectDataPanel.actionError', actionError, () => setActionError(null));
  const confirmNoteCreate = useNoteCreateConfirm('ProjectDataPanel.meetingNoteCreateConfirm');

  // Meetings/Google mini-tab (docs/dev/history/technical-design-google-calendar.md §9) -
  // "Meetings" is this section's own list below, "Google" swaps in the shared GoogleCalendarPanel. icsUrl is loaded
  // directly here (not threaded down as a prop) - same self-contained
  // "load your own settings" pattern TodosSection's hideDone already uses
  // above.
  const [mainTabState, setMainTab] = useState<MeetingsMainTab>('meetings');
  // The Google tab only while the experimental Google Calendar integration
  // is on (docs/dev/history/technical-design-about-debug-experimental.md §3.2).
  const features = useFeatures();
  const mainTabs = visibleTabs(MEETINGS_MAIN_TABS, mainTabState, 'google', features.googleCalendar);
  const mainTab = mainTabs.activeKey;
  const [icsUrl, setIcsUrl] = useState('');
  // Tag Rules for the rows' prep/review checkpoint icon - same one-shot load.
  const [tagRules, setTagRules] = useState<TagRule[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadSettings().then(s => {
      if (cancelled) return;
      setIcsUrl(s.googleCalendarIcsUrl);
      setTagRules(s.tagRules);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = meetings
    .map((meeting, index) => ({meeting, index}))
    .filter(({meeting}) => !meeting.cancelled);
  // Upcoming (soonest first) above the add block, past (most recent first)
  // below it - see domain/meetingTime.ts for the split+sort rules, including
  // how a date-only meeting (no time) is placed within its day.
  const {upcoming, past} = splitAndSortMeetings(visible);

  const runAction = async (fn: () => Promise<void>) => {
    setActionError(null);
    try {
      await fn();
      log('MeetingsSection: action done');
    } catch (e) {
      logError('MeetingsSection: action failed', errorMessage(e));
      setActionError(errorMessage(e));
    }
  };

  /** Meeting counterpart of TodosSection's handleNote above - see its doc comment. */
  const handleNote = (index: number) => {
    Keyboard.dismiss();
    runAction(async () => {
      const settings = await loadSettings();
      const {meeting, changed} = await openOrCreateMeetingNote(meetings[index], itemPath, settings, null, {
        confirmCreate: confirmNoteCreate,
      });
      if (changed) {
        const next = meetings.slice();
        next[index] = meeting;
        await onSave(next);
      }
    });
  };

  /** The row's prep/review checkpoint icon (docs/dev/history/technical-design-meeting-tracking.md) - flips the tag through the same onSave path as every other meeting write here, then an explicit e-ink flush for the direct tap. */
  const handleToggleTracking = (index: number, trackingKind: MeetingTrackingKind) => {
    runAction(async () => {
      await onSave(toggleMeetingTrackingAt(meetings, index, trackingKind));
      requestEinkRefresh();
    });
  };
  const trackingFor = (index: number): MeetingTrackingConfig => ({
    rules: tagRules,
    onToggle: trackingKind => handleToggleTracking(index, trackingKind),
  });

  // Flattened into one paginated sequence (docs/dev/technical-design-pagination-
  // edit-reuse.md §2/§4) - "Upcoming"/"Past" become header rows counted as
  // content, same rule TodosSection's flow-state groups follow. "Upcoming"
  // only gets its own header when Past also has entries.
  // Upcoming/Past as MeetingList group headers (docs/dev/technical-design-
  // meeting-lists.md §4.4) - the headers only appear when both groups exist.
  type MeetingEntryRow = {rowKey: string; meeting: Meeting; index: number};
  const meetingRows: Array<MeetingEntryRow | MeetingListHeaderRow> = [
    ...(upcoming.length > 0 && past.length > 0
      ? [{kind: 'header', key: 'header-upcoming', label: 'Upcoming'} as MeetingListHeaderRow]
      : []),
    ...upcoming.map(({meeting, index}): MeetingEntryRow => ({rowKey: `meeting-${index}`, meeting, index})),
    ...(past.length > 0 ? [{kind: 'header', key: 'header-past', label: 'Past'} as MeetingListHeaderRow] : []),
    ...past.map(({meeting, index}): MeetingEntryRow => ({rowKey: `meeting-${index}`, meeting, index})),
  ];
  return (
    <View style={styles.section}>
      {/* No separate "Meetings" label - MeetingList's own `header` below
          says it, on the list itself. */}
      <MiniTabs
        tabs={mainTabs.tabs}
        activeKey={mainTab}
        onChange={setMainTab}
        textColor={textColor}
        borderColor={borderColor}
      />
      {mainTab === 'meetings' ? (
        <>
          {/* The header row carries the pagination arrows/+N count. An empty list shows `emptyHint` below, same
              as TodosSection. */}
          <MeetingList
            listId="project"
            defaultLayout="oneLine"
            header="Meetings"
            rows={meetingRows}
            resetKey={itemPath}
            renderRow={(row, layout) => (
              <MeetingRow
                key={row.rowKey}
                meeting={row.meeting}
                layout={layout}
                time="dateTime"
                highlight="mark"
                tracking={trackingFor(row.index)}
                note={{onOpen: () => handleNote(row.index), onCreate: () => handleNote(row.index)}}
                file={{linkedFile: row.meeting.linkedFile, onOpen: onOpenLinkedFile, onArm: () => onArmLink(row.index)}}
                onPress={() => onStartEdit(row.index)}
                state={editingIndex === row.index ? 'editing' : armingIndex === row.index ? 'arming' : undefined}
                ownerPath={itemPath}
                textColor={textColor}
                borderColor={borderColor}
              />
            )}
            emptyHint="No meetings yet."
            textColor={textColor}
            borderColor={borderColor}
          />
        </>
      ) : (
        <GoogleCalendarPanel
          maxDays={30}
          defaultDestination={{type: 'item', kind, name, path: itemPath}}
          items={getCachedData()?.items ?? ([] as CachedItem[])}
          icsUrl={icsUrl}
          inboxPath={getCachedData()?.paths.inboxFolder ?? ''}
          onOpenSettings={() => onOpenCalendarSettings?.()}
          textColor={textColor}
          borderColor={borderColor}
          placeholderColor={placeholderColor}
        />
      )}
    </View>
  );
}
