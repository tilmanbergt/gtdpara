/**
 * Close-out step 5 - Archive (docs/dev/history/technical-design-project-close-out.md
 * §7/§8.2, mockup "5 · Archive"): the numbered list of exactly what will
 * happen - rendered from the same op list the executor runs
 * (domain/closeOut/archiveOps.ts) - then "Archive now". While and after
 * running, the same list shows ✓/✕ per op; a failure names what already
 * moved, and running again resumes.
 */
import React from 'react';
import {Text, View} from 'react-native';
import {ArchiveOp, describeOp} from '../../domain/closeOut/archiveOps';
import {blockers} from '../../domain/closeOut/readiness';
import {CloseOutContext} from '../../storage/closeOut/context';
import {OpStatus} from '../../storage/closeOut/execute';
import PillButton from '../PillButton';
import {co} from './closeOutStyles';

export interface ArchiveRunState {
  running: boolean;
  steps: OpStatus[] | null;
  ok: boolean | null;
  error: string | null;
}

interface Props {
  ctx: CloseOutContext;
  ops: ArchiveOp[];
  run: ArchiveRunState;
  onArchive: () => void;
  onFinish: () => void;
  onGoToStep: (step: 'checklist' | 'pdf') => void;
  textColor: string;
  borderColor: string;
}

const STATE_MARK: Record<OpStatus['state'], string> = {pending: '○', running: '▸', done: '✓', skipped: '✓', failed: '✕'};

export default function ArchiveStep({ctx, ops, run, onArchive, onFinish, onGoToStep, textColor, borderColor}: Props): React.JSX.Element {
  const open = blockers(ctx.findings);
  const needsPdf = ctx.mode === 'full' && (!ctx.plan.pdf || !ctx.plan.pdf.checked);
  const openFromHere = ctx.findings.find(f => f.id === 'openFromHere');
  const statusByOp = new Map((run.steps ?? []).map(s => [s.op.id, s]));

  if (run.ok) {
    return (
      <View style={co.fill}>
        <View style={[co.box, {borderColor: textColor}]}>
          <Text style={[co.strong, {color: textColor}, co.large]}>✓ {ctx.item.name} is archived</Text>
          {ctx.targets.pdf && <Text style={[co.path, {color: textColor}]}>{ctx.display(ctx.targets.pdf)}</Text>}
          <Text style={[co.path, {color: textColor}]}>{ctx.display(ctx.targets.folder)}/</Text>
        </View>
        <View style={co.row}>
          <PillButton label="Done" size="large" primary onPress={onFinish} textColor={textColor} borderColor={borderColor} />
        </View>
      </View>
    );
  }

  return (
    <View style={co.fill}>
      <View style={[co.box, co.wrapRow, {borderColor: textColor}]}>
        <Text style={[co.body, {color: textColor}, co.mr20, open.length === 0 && co.strong]}>{open.length === 0 ? '✓ Checklist clear' : `✕ ${open.length} blocker${open.length === 1 ? '' : 's'}`}</Text>
        {ctx.mode === 'full' && <Text style={[co.body, {color: textColor}, co.mr20]}>{needsPdf ? '✕ PDF not checked' : '✓ PDF checked'}</Text>}
        {ctx.mode === 'quick' && <Text style={[co.body, {color: textColor}]}>Quick archive - no PDF, no outcome moves</Text>}
      </View>
      <Text style={[co.sectionTitle, {color: textColor}]}>{run.steps ? 'Progress' : 'What happens when you tap Archive now'}</Text>
      {ops.map((op, i) => {
        const s = statusByOp.get(op.id);
        return (
          <View key={op.id} style={[co.row, {borderBottomColor: borderColor}, co.minH44, co.borderBottom]}>
            <Text style={[co.strong, {color: textColor}, co.w36]}>{s ? STATE_MARK[s.state] : `${i + 1}.`}</Text>
            <View style={co.fill}>
              <Text style={[co.body, {color: textColor}]} numberOfLines={2}>
                {describeOp(op, ctx.display)}
              </Text>
              {s?.error && <Text style={[co.small, co.strong, {color: textColor}]}>{s.error}</Text>}
            </View>
          </View>
        );
      })}
      {openFromHere && <Text style={[co.body, {color: textColor}, co.mt10]}>i {openFromHere.label} - {openFromHere.caption}. The device will then say the note no longer exists; that's expected.</Text>}
      {run.ok === false && <Text style={[co.body, {color: textColor}, co.mt8]}>Stopped. Nothing was undone - fix the cause and tap Archive now again to continue where it stopped.</Text>}
      <View style={[co.wrapRow, co.mt14]}>
        <PillButton label={run.running ? 'Archiving…' : 'Archive now'} size="large" primary disabled={run.running || open.length > 0 || needsPdf} onPress={onArchive} textColor={textColor} borderColor={borderColor} />
        {open.length > 0 && <PillButton label="Go to checklist" size="large" onPress={() => onGoToStep('checklist')} textColor={textColor} borderColor={borderColor} />}
        {open.length === 0 && needsPdf && <PillButton label="Go to PDF" size="large" onPress={() => onGoToStep('pdf')} textColor={textColor} borderColor={borderColor} />}
      </View>
    </View>
  );
}
