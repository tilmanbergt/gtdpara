/**
 * Close-out step 1 - Checklist (docs/dev/technical-design-project-close-out.md
 * §8.2, mockup artboard "1 · Checklist"). Shows area, done date and the
 * archive targets, then every readiness finding (domain/closeOut/
 * readiness.ts) with inline actions for the two blockers: open todos
 * (Done / Cancel / → Area / → Inbox) and future meetings (Cancel / → Area /
 * → Inbox), and "Process ›" for open marks (lasso 0.8, a warning). Findings and their items are one flattened paged list, so a
 * project with many open todos never overflows the screen.
 *
 * "Change area" swaps the finding list for a paged list of active Areas
 * ("No area" first) - simpler than arming the Files pane, and the Areas are
 * exactly what can be picked.
 */
import React, {useMemo, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {Finding, FindingItem} from '../../domain/closeOut/readiness';
import {readinessSummary} from '../../domain/closeOut/readiness';
import {CloseOutContext} from '../../storage/closeOut/context';
import {getCachedData} from '../../storage/dataCache';
import DateInput from '../DateInput';
import PagedSection from '../PagedSection';
import PillButton from '../PillButton';
import StatusMarkRow from '../StatusMarkRow';
import {co, ROW_H} from './closeOutStyles';
import {openMarks} from '../marksNav';
import {formatDate} from '../../domain/dateFormat';

export interface ChecklistActions {
  closeTodo: (index: number, how: 'done' | 'cancelled') => void;
  moveTodo: (index: number, to: 'area' | 'inbox') => void;
  cancelMeeting: (index: number) => void;
  moveMeeting: (index: number, to: 'area' | 'inbox') => void;
  setArea: (areaName: string | null) => void;
  setDoneAt: (date: string) => void;
}

type Row = {kind: 'finding'; finding: Finding} | {kind: 'item'; finding: Finding; item: FindingItem};

interface Props {
  ctx: CloseOutContext;
  busy: boolean;
  actions: ChecklistActions;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}

export default function ChecklistStep({ctx, busy, actions, textColor, borderColor, placeholderColor}: Props): React.JSX.Element {
  const [pickingArea, setPickingArea] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [dateDraft, setDateDraft] = useState(ctx.doneAt ?? '');
  const hasArea = !!ctx.item.area;

  const rows: Row[] = useMemo(
    () =>
      ctx.findings.flatMap(f => [
        {kind: 'finding' as const, finding: f},
        ...f.items.map(item => ({kind: 'item' as const, finding: f, item})),
      ]),
    [ctx.findings],
  );

  const areas = useMemo(
    () => [
      {name: null as string | null, label: '— No area (independent project)'},
      ...(getCachedData()?.items ?? [])
        .filter(i => i.kind === 'area' && i.status === 'active')
        .map(i => ({name: i.name as string | null, label: i.name}))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
    // Recomputed whenever the context reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx],
  );

  const renderItemActions = (f: Finding, item: FindingItem) => {
    if (f.id === 'openMarks') {
      // Lasso 0.8 §3.10: process this project's marks; Close comes back here.
      return (
        <View style={co.row}>
          <PillButton label="Process ›" disabled={busy} onPress={() => openMarks({type: 'item', path: ctx.item.path}, 'closeOut')} textColor={textColor} borderColor={borderColor} />
        </View>
      );
    }
    if (item.index === undefined) return null;
    const index = item.index;
    if (f.id === 'openTodos') {
      return (
        <View style={co.row}>
          <PillButton label="Done" disabled={busy} onPress={() => actions.closeTodo(index, 'done')} textColor={textColor} borderColor={borderColor} />
          <PillButton label="Cancel" disabled={busy} onPress={() => actions.closeTodo(index, 'cancelled')} textColor={textColor} borderColor={borderColor} />
          {hasArea && <PillButton label="→ Area" disabled={busy} onPress={() => actions.moveTodo(index, 'area')} textColor={textColor} borderColor={borderColor} />}
          <PillButton label="→ Inbox" disabled={busy} onPress={() => actions.moveTodo(index, 'inbox')} textColor={textColor} borderColor={borderColor} />
        </View>
      );
    }
    if (f.id === 'futureMeetings') {
      return (
        <View style={co.row}>
          <PillButton label="Cancel" disabled={busy} onPress={() => actions.cancelMeeting(index)} textColor={textColor} borderColor={borderColor} />
          {hasArea && <PillButton label="→ Area" disabled={busy} onPress={() => actions.moveMeeting(index, 'area')} textColor={textColor} borderColor={borderColor} />}
          <PillButton label="→ Inbox" disabled={busy} onPress={() => actions.moveMeeting(index, 'inbox')} textColor={textColor} borderColor={borderColor} />
        </View>
      );
    }
    return null;
  };

  return (
    <View style={co.fill}>
      <View style={[co.box, {borderColor: textColor}]}>
        <View style={co.kvRow}>
          <Text style={[co.kvKey, {color: textColor}]}>Area</Text>
          <Text style={[co.kvValue, {color: textColor}]}>{ctx.item.area ?? '— none (independent project)'}</Text>
          <PillButton label={pickingArea ? 'Close' : 'Change…'} disabled={busy} onPress={() => setPickingArea(v => !v)} textColor={textColor} borderColor={borderColor} />
        </View>
        <View style={co.kvRow}>
          <Text style={[co.kvKey, {color: textColor}]}>Done on</Text>
          {editingDate ? (
            <View style={[co.row, co.fill]}>
              <DateInput value={dateDraft} onChangeText={setDateDraft} placeholderColor={placeholderColor} textColor={textColor} borderColor={borderColor} />
              <View style={co.w8} />
              <PillButton
                label="Save"
                primary
                disabled={busy || !/^\d{4}-\d{2}-\d{2}$/.test(dateDraft)}
                onPress={() => {
                  actions.setDoneAt(dateDraft);
                  setEditingDate(false);
                }}
                textColor={textColor}
                borderColor={borderColor}
              />
              <PillButton label="Cancel" onPress={() => setEditingDate(false)} textColor={textColor} borderColor={borderColor} />
            </View>
          ) : (
            <>
              <Text style={[co.kvValue, {color: textColor}]}>
                {ctx.doneAt ? formatDate(ctx.doneAt) : 'not set'}
                <Text style={[co.small, co.muted]}>  — decides the archive year</Text>
              </Text>
              <PillButton
                label="Edit"
                disabled={busy}
                onPress={() => {
                  setDateDraft(ctx.doneAt ?? '');
                  setEditingDate(true);
                }}
                textColor={textColor}
                borderColor={borderColor}
              />
            </>
          )}
        </View>
        <View style={co.kvRow}>
          <Text style={[co.kvKey, {color: textColor}]}>Folder to</Text>
          <Text style={[co.kvValue, co.path, {color: textColor}]} numberOfLines={1}>
            {ctx.display(ctx.targets.folder)}/
          </Text>
        </View>
        {ctx.targets.pdf && (
          <View style={co.kvRow}>
            <Text style={[co.kvKey, {color: textColor}]}>PDF to</Text>
            <Text style={[co.kvValue, co.path, {color: textColor}]} numberOfLines={1}>
              {ctx.display(ctx.targets.pdf)}
            </Text>
          </View>
        )}
      </View>

      {pickingArea ? (
        <View style={co.fill}>
          <PagedSection
            header="Assign this project to an Area"
            rows={areas}
            rowHeight={() => ROW_H.entry}
            renderRow={a => (
              <Pressable
                key={a.label}
                style={[co.entryRow, {borderBottomColor: borderColor}]}
                onPress={() => {
                  actions.setArea(a.name);
                  setPickingArea(false);
                }}>
                <Text style={[co.body, {color: textColor}, a.name === ctx.item.area && co.strong]}>
                  {a.name === ctx.item.area ? '● ' : ''}
                  {a.label}
                </Text>
              </Pressable>
            )}
            textColor={textColor}
            borderColor={borderColor}
          />
        </View>
      ) : (
        <View style={co.fill}>
          <PagedSection
            header={`Readiness · ${readinessSummary(ctx.findings)}`}
            rows={rows}
            rowHeight={r => (r.kind === 'finding' ? ROW_H.finding : ROW_H.item)}
            isCountableRow={r => r.kind === 'finding'}
            renderRow={r =>
              r.kind === 'finding' ? (
                <View key={`f-${r.finding.id}`} style={{height: ROW_H.finding}}>
                  <StatusMarkRow kind={r.finding.severity} label={r.finding.label} caption={r.finding.caption} textColor={textColor} borderColor={borderColor} />
                </View>
              ) : (
                <View key={`i-${r.finding.id}-${r.item.index ?? r.item.label}`} style={[co.itemRow, {borderBottomColor: borderColor}]}>
                  <Text style={[co.body, {color: textColor}, co.fill]} numberOfLines={2}>
                    {r.item.label}
                  </Text>
                  {renderItemActions(r.finding, r.item)}
                </View>
              )
            }
            textColor={textColor}
            borderColor={borderColor}
          />
          <Text style={[co.small, co.muted, {color: textColor}]}>Blockers only stop the archive step. Contents, outcomes and the PDF can be prepared already.</Text>
        </View>
      )}
    </View>
  );
}
