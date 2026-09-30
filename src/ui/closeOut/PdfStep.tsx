/**
 * Close-out step 4 - the project PDF (docs/dev/technical-design-project-close-
 * out.md §8.2, mockups "4a/4b"): create it (progress + Cancel), then open it
 * in Supernote's reader to check it, and confirm "I checked the PDF" - the
 * archive step requires that tick. Any later change to contents or outcomes
 * clears the tick (domain/closeOut/plan.ts), so the checked PDF is always
 * the one that gets archived.
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {PdfExportProgress} from '../../storage/pdfExport';
import {CloseOutContext} from '../../storage/closeOut/context';
import PillButton from '../PillButton';
import ProgressBar from '../ProgressBar';
import {COLORS} from '../theme';
import {co} from './closeOutStyles';

export interface PdfRunState {
  running: boolean;
  progress: PdfExportProgress | null;
  /** Pages that became placeholders in the last run. */
  failedPages: string[];
  lastRunMs: number | null;
  error: string | null;
}

interface Props {
  ctx: CloseOutContext;
  busy: boolean;
  run: PdfRunState;
  onCreate: () => void;
  onCancel: () => void;
  onOpen: () => void;
  onToggleChecked: () => void;
  onChangeContents: () => void;
  textColor: string;
  borderColor: string;
}

const PHASE_LABEL: Record<PdfExportProgress['phase'], string> = {render: 'Rendering pages', layout: 'Laying out', build: 'Writing PDF'};

export default function PdfStep({ctx, busy, run, onCreate, onCancel, onOpen, onToggleChecked, onChangeContents, textColor, borderColor}: Props): React.JSX.Element {
  const pdf = ctx.plan.pdf;
  const p = run.progress;

  if (run.running) {
    return (
      <View style={{flex: 1}}>
        <Text style={[co.strong, {color: textColor, marginBottom: 10}]}>
          Creating PDF… {p ? `${PHASE_LABEL[p.phase]} ${p.done} of ${p.total}` : ''}
        </Text>
        <ProgressBar done={p?.phase === 'build' ? p.done : p?.done ?? 0} total={p?.total ?? 1} borderColor={textColor} />
        <Text style={[co.body, {color: textColor, marginTop: 8}]} numberOfLines={1}>
          {p?.label ?? ''}
        </Text>
        <View style={[co.boxLight, {borderColor, marginTop: 16}]}>
          <Text style={[co.small, co.muted, {color: textColor}]}>Written to (moves into the archive in step 5)</Text>
          <Text style={[co.path, {color: textColor}]}>{ctx.display(ctx.workingPdfPath)}</Text>
          <Text style={[co.small, co.muted, {color: textColor}]}>Written as a .part file and renamed when finished - a cancelled run leaves nothing half-done. Keep gtdpara open until it's done.</Text>
        </View>
        <View style={co.row}>
          <PillButton label="Cancel" size="large" onPress={onCancel} textColor={textColor} borderColor={borderColor} />
        </View>
      </View>
    );
  }

  return (
    <View style={{flex: 1}}>
      {!pdf ? (
        <View style={[co.box, {borderColor: textColor}]}>
          <Text style={[co.strong, {color: textColor}]}>
            {ctx.contents.includedEntries} files · {ctx.contents.includedNotePages} note pages + text pages
          </Text>
          <Text style={[co.small, co.muted, {color: textColor}]}>The PDF is created in the project folder and moves into the archive in step 5.</Text>
        </View>
      ) : (
        <View style={[co.box, {borderColor: textColor}]}>
          <Text style={[co.strong, {color: textColor}]}>
            ✓ PDF created · {pdf.pages} pages · {pdf.createdAt.replace('T', ' ')}
            {run.lastRunMs ? ` · ${Math.round(run.lastRunMs / 1000)} s` : ''}
          </Text>
          <Text style={[co.path, {color: textColor}]}>{ctx.display(ctx.workingPdfPath)}</Text>
        </View>
      )}
      {run.failedPages.length > 0 && (
        <View style={[co.box, {borderColor: textColor}]}>
          <Text style={[co.body, {color: textColor}]}>
            <Text style={co.strong}>! {run.failedPages.length} page{run.failedPages.length === 1 ? '' : 's'} could not be rendered: </Text>
            {run.failedPages.slice(0, 3).join(', ')}
            {run.failedPages.length > 3 ? ' …' : ''}. A placeholder page names each one in the PDF.
          </Text>
        </View>
      )}
      <View style={co.wrapRow}>
        {pdf && <PillButton label="Open PDF to check" size="large" primary disabled={busy} onPress={onOpen} textColor={textColor} borderColor={borderColor} />}
        <PillButton label={pdf ? 'Create again' : 'Create PDF'} size="large" primary={!pdf} disabled={busy} onPress={onCreate} textColor={textColor} borderColor={borderColor} />
        <PillButton label="Change contents…" size="large" disabled={busy} onPress={onChangeContents} textColor={textColor} borderColor={borderColor} />
      </View>
      {pdf && (
        <>
          <Text style={[co.small, co.muted, {color: textColor, marginTop: 4}]}>The PDF opens in Supernote's reader. Come back with the gtdpara button and you land here again.</Text>
          <Pressable style={[co.box, co.row, {borderColor: textColor, marginTop: 12}]} disabled={busy} onPress={onToggleChecked}>
            <View style={[co.checkbox, {borderColor: textColor}, pdf.checked && {backgroundColor: COLORS.accent, borderColor: COLORS.accent}]}>
              {pdf.checked && <Text style={{color: COLORS.accentText, fontWeight: '700'}}>✓</Text>}
            </View>
            <Text style={[co.strong, {color: textColor, flex: 1}]}>I checked the PDF - it looks right</Text>
            <Text style={[co.small, co.muted, {color: textColor}]}>required before archiving</Text>
          </Pressable>
        </>
      )}
      <Text style={[co.sectionTitle, {color: textColor}]}>Sections</Text>
      {ctx.contents.groups
        .filter(g => g.entries.some(e => e.included))
        .map(g => (
          <Text key={g.id} style={[co.body, {color: textColor}]} numberOfLines={1}>
            {g.title}
            <Text style={[co.small, co.muted]}>  {g.id === 'record' ? 'cover, contents, todos and meetings' : `${g.entries.filter(e => e.included).length} included`}</Text>
          </Text>
        ))}
    </View>
  );
}
