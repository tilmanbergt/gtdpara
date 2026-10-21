/**
 * The touch test's sample rows: real `TaskRow`s and `MeetingRow`s
 * (touchTestSamples.ts), wired like Daily's - same `taskRowHeight`/
 * `numberOfLines`, context tags tappable, `#next` double tap - so their hit
 * areas are the real ones. Each row gets its own probe
 * (ui/touchDiag/touchProbe.ts): what it reports is prefixed with the row
 * number, and `hitTarget` decides which of its parts is drawn as hit.
 *
 * Every handler only reports a press; nothing is edited, ticked or opened.
 * Tags and the `#next`/`#w/f` labels report their own presses (the probe
 * turns their actions off), so their handlers here are no-ops that only
 * make them tappable as on Daily.
 */
import React from 'react';
import {View} from 'react-native';
import MeetingRow, {MEETING_ROW_HEIGHT} from '../../../ui/MeetingRow';
import TaskRow, {taskRowHeight, taskRowLines} from '../../../ui/TaskRow';
import {TASK_COLUMN_WIDTH_PX} from '../../../ui/taskRowLayout';
import {TouchProbe, TouchProbeContext} from '../../../ui/touchDiag/touchProbe';
import {reportOutcome} from '../../../utils/touchDiagStore';
import {touchSample, TouchSample} from './touchTestSamples';

function sampleHeight(sample: TouchSample): number {
  return sample.kind === 'task' ? taskRowHeight(sample.task, TASK_COLUMN_WIDTH_PX, 'flat') : MEETING_ROW_HEIGHT[sample.layout];
}

/** The samples from row 1 on that fit into `height` dp, one after another. */
export function fillColumn(height: number): TouchSample[] {
  const out: TouchSample[] = [];
  let used = 0;
  for (let i = 0; ; i++) {
    const sample = touchSample(i);
    used += sampleHeight(sample);
    if (used > height) return out;
    out.push(sample);
  }
}

function probeFor(row: number, hitTarget: string | null): TouchProbe {
  const prefix = `${row}:`;
  return {
    report: (kind, part, inert) => reportOutcome(kind, prefix + part, inert),
    hit: hitTarget?.startsWith(prefix) ? hitTarget.slice(prefix.length) : null,
  };
}

const noop = () => undefined;

interface Props {
  samples: TouchSample[];
  /** The target the last touch hit (`<row>:<part>`), or null. */
  hitTarget: string | null;
  textColor: string;
  borderColor: string;
}

export default function TestRows({samples, hitTarget, textColor, borderColor}: Props): React.JSX.Element {
  return (
    <View>
      {samples.map(sample => {
        const n = sample.number;
        const press = (part: string) => () => reportOutcome('press', `${n}:${part}`);
        return (
          <TouchProbeContext.Provider key={n} value={probeFor(n, hitTarget)}>
            {sample.kind === 'task' ? (
              <TaskRow
                task={sample.task}
                isEditing={false}
                onStartEdit={press('title')}
                onToggleDone={press('checkbox')}
                onCreateNote={press('noteIcon')}
                onOpenNote={press('noteIcon')}
                linkedFile={sample.task.linkedFile}
                onOpenLinkedFile={press('clip')}
                onArmLink={sample.armLink ? press('clip') : undefined}
                onToggleNow={noop}
                contextTag={null}
                onToggleContext={noop}
                ownerPath={null}
                context="flat"
                height={taskRowHeight(sample.task, TASK_COLUMN_WIDTH_PX, 'flat')}
                numberOfLines={taskRowLines(sample.task, TASK_COLUMN_WIDTH_PX, 'flat')}
                textColor={textColor}
                borderColor={borderColor}
              />
            ) : (
              <MeetingRow
                meeting={sample.meeting}
                layout={sample.layout}
                time="time"
                source={{abbrev: 'TT', name: 'Touch test', onPress: press('label:source')}}
                highlight="mark"
                note={{onOpen: press('noteIcon'), onCreate: press('noteIcon')}}
                file={{linkedFile: sample.meeting.linkedFile, onOpen: press('clip'), onArm: sample.armLink ? press('clip') : undefined}}
                onPress={press('rowBody')}
                contextTag={null}
                onToggleContext={noop}
                ownerPath={null}
                textColor={textColor}
                borderColor={borderColor}
              />
            )}
          </TouchProbeContext.Provider>
        );
      })}
    </View>
  );
}
