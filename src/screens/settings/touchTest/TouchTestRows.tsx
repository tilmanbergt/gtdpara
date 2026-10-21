/**
 * One column of the touch test's target area: real `TaskRow`s and
 * `MeetingRow`s with the sample entries (touchTestSamples.ts), wired like
 * Daily's (same `taskRowHeight`/`numberOfLines`, context tags tappable,
 * `#next` double tap) so their hit areas are the real ones. With `armLink`
 * the rows also show the "+clip" target, as on the Current tab.
 *
 * Every handler only reports a press to the touch-test store; nothing is
 * edited, ticked or opened.
 */
import React from 'react';
import {View} from 'react-native';
import {TouchTarget} from '../../../domain/touchDiag';
import MeetingRow, {MEETING_ROW_HEIGHT} from '../../../ui/MeetingRow';
import TaskRow, {taskRowHeight, taskRowLines} from '../../../ui/TaskRow';
import {TASK_COLUMN_WIDTH_PX} from '../../../ui/taskRowLayout';
import {reportOutcome} from '../../../ui/touchDiag/touchDiagStore';
import {touchSample, TouchSample} from './touchTestSamples';

function sampleHeight(sample: TouchSample): number {
  return sample.kind === 'task' ? taskRowHeight(sample.task, TASK_COLUMN_WIDTH_PX, 'flat') : MEETING_ROW_HEIGHT[sample.layout];
}

/** The samples from `start` on that fit into `height` dp, one after another. */
export function fillColumn(start: number, height: number): TouchSample[] {
  const out: TouchSample[] = [];
  let used = 0;
  for (let i = start; ; i++) {
    const sample = touchSample(i);
    const h = sampleHeight(sample);
    if (used + h > height) return out;
    out.push(sample);
    used += h;
  }
}

const press = (target: TouchTarget) => () => reportOutcome('press', target);

interface Props {
  samples: TouchSample[];
  armLink: boolean;
  textColor: string;
  borderColor: string;
}

export default function TouchTestRows({samples, armLink, textColor, borderColor}: Props): React.JSX.Element {
  return (
    <View>
      {samples.map(sample =>
        sample.kind === 'task' ? (
          <TaskRow
            key={sample.number}
            task={sample.task}
            isEditing={false}
            onStartEdit={press('title')}
            onToggleDone={press('checkbox')}
            onCreateNote={press('note')}
            onOpenNote={press('note')}
            linkedFile={sample.task.linkedFile}
            onOpenLinkedFile={press('clip')}
            onArmLink={armLink ? press('clip') : undefined}
            onToggleNow={press('nowToggle')}
            contextTag={null}
            onToggleContext={press('tag')}
            ownerPath={null}
            context="flat"
            height={taskRowHeight(sample.task, TASK_COLUMN_WIDTH_PX, 'flat')}
            numberOfLines={taskRowLines(sample.task, TASK_COLUMN_WIDTH_PX, 'flat')}
            textColor={textColor}
            borderColor={borderColor}
          />
        ) : (
          <MeetingRow
            key={sample.number}
            meeting={sample.meeting}
            layout={sample.layout}
            time="time"
            source={{abbrev: 'TT', name: 'Touch test', onPress: press('source')}}
            highlight="mark"
            note={{onOpen: press('note'), onCreate: press('note')}}
            file={{linkedFile: sample.meeting.linkedFile, onOpen: press('clip'), onArm: armLink ? press('clip') : undefined}}
            onPress={press('row')}
            contextTag={null}
            onToggleContext={press('tag')}
            ownerPath={null}
            textColor={textColor}
            borderColor={borderColor}
          />
        ),
      )}
    </View>
  );
}
