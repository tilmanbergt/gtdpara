/**
 * Quick Add folded into one dashed line until it is wanted
 * (docs/dev/history/technical-design-engage.md §3.7, D12): tapping the line
 * expands the real `QuickAddWidget` with a fixed destination; Cancel folds it
 * again, and so does a successful add (or a Change of an agreement). What a
 * screen adds to new entries - the meeting they came from, the owner's tag
 * (docs/dev/history/technical-design-meetings-0.21.md R7) - it applies in
 * its own handlers and names in `provenance`, Quick Add's grey line. No
 * Quick Add logic lives here.
 *
 * Expanded or not is the caller's state, so a screen that decides its own
 * layout from it (the Engage panel's flow) stays the one place that decides.
 */
import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Destination} from '../domain/destination';
import PillButton from './PillButton';
import {QuickAddAdds} from './quickAdd/ProvenanceLine';
import {AgreementHandlers} from './quickAdd/useAgreementDraft';
import {MeetingSeed} from './quickAdd/useDraftRequests';
import QuickAddWidget, {MeetingQuickAddFields, QuickAddEditTarget} from './QuickAddWidget';
import {FONT, RADII, SPACING} from './theme';

interface Props {
  label: string;
  cancelLabel: string;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  destination: Destination;
  layoutKey: string;
  onAddTask: (text: string, destination: Destination) => Promise<void>;
  onAddMeeting: (fields: MeetingQuickAddFields, destination: Destination) => Promise<void>;
  /** The grey line: what the screen adds to new entries, a ✕ per part. */
  provenance?: QuickAddAdds | null;
  /** "+ Next <type>": the Meeting tab with this seed. */
  meetingSeed?: MeetingSeed | null;
  /** The Agreement tab, and an agreement's Change in the box. */
  agreements?: {handlers: AgreementHandlers; editTarget: QuickAddEditTarget | null; onCancelEdit: () => void};
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}

export default function CollapsedQuickAdd({
  label,
  cancelLabel,
  expanded,
  onExpand,
  onCollapse,
  destination,
  layoutKey,
  onAddTask,
  onAddMeeting,
  provenance,
  meetingSeed,
  agreements,
  textColor,
  borderColor,
  placeholderColor,
}: Props): React.JSX.Element {
  if (!expanded) {
    return (
      <Pressable onPress={onExpand} style={[styles.collapsed, {borderColor: textColor}]}>
        <Text style={[styles.collapsedText, {color: textColor}]}>{label}</Text>
      </Pressable>
    );
  }
  return (
    <Expanded
      {...{onCollapse, destination, layoutKey, onAddTask, onAddMeeting, provenance, meetingSeed, agreements, cancelLabel, textColor, borderColor, placeholderColor}}
    />
  );
}

type ExpandedProps = Omit<Props, 'label' | 'expanded' | 'onExpand'>;

/** The open box. */
function Expanded(props: ExpandedProps): React.JSX.Element {
  const {onCollapse, destination, layoutKey, onAddTask, onAddMeeting, provenance, meetingSeed, agreements, cancelLabel, textColor, borderColor, placeholderColor} = props;
  // Quick Add takes a seed that is there when it mounts as already handled (a remount never re-applies one);
  // the box mounts together with "+ Next"'s seed, so the seed is handed over one render later.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const addTask = async (text: string, dest: Destination) => {
    await onAddTask(text, dest);
    onCollapse();
  };
  const addMeeting = async (fields: MeetingQuickAddFields, dest: Destination) => {
    await onAddMeeting(fields, dest);
    onCollapse();
  };
  const handlers = agreements?.handlers;
  const addAgreement = handlers?.onAddAgreement;
  const changeAgreement = handlers?.onChangeAgreement;
  const cancel = () => {
    agreements?.onCancelEdit();
    onCollapse();
  };
  return (
    <View style={styles.expanded}>
      <QuickAddWidget
        layoutKey={layoutKey}
        fixedDestination={destination}
        onAddTask={addTask}
        onAddMeeting={addMeeting}
        provenance={provenance}
        meetingSeed={mounted ? meetingSeed : null}
        editTarget={agreements?.editTarget ?? null}
        onCancelEdit={cancel}
        onAddAgreement={
          addAgreement
            ? async (text, valid) => {
                const done = await addAgreement(text, valid);
                onCollapse();
                return done;
              }
            : undefined
        }
        onSaveEditAgreement={handlers?.onSaveEditAgreement}
        onChangeAgreement={
          changeAgreement
            ? async (text, valid) => {
                const done = await changeAgreement(text, valid);
                if (done !== false) onCollapse();
                return done;
              }
            : undefined
        }
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
      <View style={styles.cancelRow}>
        <PillButton label={cancelLabel} onPress={cancel} textColor={textColor} borderColor={borderColor} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  collapsed: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: RADII.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.md,
  },
  collapsedText: {
    fontSize: FONT.medium,
  },
  expanded: {
    marginTop: SPACING.md,
  },
  cancelRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: SPACING.sm,
  },
});
