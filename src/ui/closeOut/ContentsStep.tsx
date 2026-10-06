/**
 * Close-out step 2 - Contents (docs/dev/history/technical-design-project-close-out.md
 * §8.2, mockup "2 · Contents"): every file of the project grouped the way
 * the PDF will be, each with a tick box (only where it can be included),
 * its size, and whether it ends up "in PDF" or "listed only". One flattened
 * paged list; the summary line on top comes from domain/closeOut/inventory.ts.
 */
import React, {useMemo} from 'react';
import {Pressable, Text, View} from 'react-native';
import {ContentEntry} from '../../domain/closeOut/inventory';
import {CloseOutContext} from '../../storage/closeOut/context';
import PagedSection from '../PagedSection';
import {COLORS} from '../theme';
import {co, ROW_H} from './closeOutStyles';

type Row = {kind: 'group'; title: string; note: string} | {kind: 'entry'; entry: ContentEntry};

interface Props {
  ctx: CloseOutContext;
  busy: boolean;
  onToggle: (entry: ContentEntry) => void;
  textColor: string;
  borderColor: string;
}

function minutesLabel(seconds: number): string {
  return seconds < 90 ? `about ${Math.max(5, Math.round(seconds / 5) * 5)} s` : `about ${Math.round(seconds / 60)} min`;
}

export default function ContentsStep({ctx, busy, onToggle, textColor, borderColor}: Props): React.JSX.Element {
  const rows: Row[] = useMemo(
    () =>
      ctx.contents.groups.flatMap(g => [
        {kind: 'group' as const, title: g.title, note: g.id === 'record' ? 'always included' : g.id === 'outside' ? 'not archived' : ''},
        ...g.entries.map(entry => ({kind: 'entry' as const, entry})),
      ]),
    [ctx.contents],
  );
  const c = ctx.contents;

  return (
    <View style={co.fill}>
      <View style={[co.box, co.row, {borderColor: textColor}]}>
        <Text style={[co.strong, {color: textColor}, co.fill]}>
          In the PDF: {c.includedEntries} files · {c.includedNotePages} note pages + text pages
        </Text>
        <Text style={[co.small, co.muted, {color: textColor}]}>{minutesLabel(c.estimatedSeconds)}</Text>
      </View>
      <Text style={[co.small, co.muted, {color: textColor}, co.mb6]}>
        Everything stays in the archive folder either way. Unticked files are listed in the PDF's index with where they are.
      </Text>
      <View style={co.fill}>
        <PagedSection
          header="Contents"
          rows={rows}
          rowHeight={r => (r.kind === 'group' ? ROW_H.group : ROW_H.entry)}
          isCountableRow={r => r.kind === 'entry'}
          renderRow={r => {
            if (r.kind === 'group') {
              return (
                <View key={`g-${r.title}`} style={[co.groupRow, co.row, {borderBottomColor: textColor}, co.alignEnd]}>
                  <Text style={[co.strong, {color: textColor}, co.fill]}>{r.title}</Text>
                  <Text style={[co.small, co.muted, {color: textColor}]}>{r.note}</Text>
                </View>
              );
            }
            const e = r.entry;
            const locked = e.group === 'record';
            const toggle = e.includable && !locked && !busy;
            return (
              <Pressable key={`e-${e.key}`} style={[co.entryRow, {borderBottomColor: borderColor}]} disabled={!toggle} onPress={() => onToggle(e)}>
                <View
                  style={[
                    co.checkbox,
                    {borderColor: e.includable ? textColor : borderColor},
                    e.includable ? co.solid : co.dashed,
                    e.included && (locked ? co.checkedLocked : co.checked),
                  ]}>
                  {e.included && <Text style={[{color: COLORS.accentText}, co.bold]}>✓</Text>}
                </View>
                <View style={co.fill}>
                  <Text style={[co.body, {color: textColor}]} numberOfLines={1}>
                    {e.title}
                  </Text>
                  <Text style={[co.small, co.muted, {color: textColor}]} numberOfLines={1}>
                    {e.meta}
                    {e.movedTo ? ` · moves to ${ctx.outcomeLabel(e.movedTo)}` : ''}
                  </Text>
                </View>
                <Text style={[co.small, {color: textColor}, co.w190, co.right, !e.included && co.muted]} numberOfLines={2}>
                  {e.included ? 'in PDF' : e.listedReason ?? 'listed only'}
                </Text>
              </Pressable>
            );
          }}
          textColor={textColor}
          borderColor={borderColor}
        />
      </View>
    </View>
  );
}
