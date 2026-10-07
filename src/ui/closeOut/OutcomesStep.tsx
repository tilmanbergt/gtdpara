/**
 * Close-out step 3 - Outcomes (docs/dev/history/technical-design-project-close-out.md
 * §8.2, mockup "3 · Outcomes"): which files live on after the project.
 * Left: the project's files that may move (not its own meeting/todo notes -
 * those are the project record). Right: "Stays in archive", or browse the
 * Area's folder / Resources with the existing Files pane and "Move here".
 * Nothing moves now - the destination is only written to the plan; all
 * moves happen together in step 5.
 *
 * Reuses ui/ReviewMasterDetail.tsx (the Review steps' list/detail shell) and
 * ui/FileBrowserPane.tsx in plain browsing mode, reading the folder being
 * shown through onActiveLocationChange - the same approach the standalone
 * note quick-add uses to know where a note would land.
 */
import React, {useState} from 'react';
import {Text, View} from 'react-native';
import {ContentEntry} from '../../domain/closeOut/inventory';
import {OutcomeDest} from '../../domain/closeOut/plan';
import {CloseOutContext} from '../../storage/closeOut/context';
import FileBrowserPane, {FileBrowserRoot} from '../FileBrowserPane';
import PillButton from '../PillButton';
import ReviewMasterDetail from '../ReviewMasterDetail';
import {co, ROW_H} from './closeOutStyles';

interface Props {
  ctx: CloseOutContext;
  busy: boolean;
  onSetMove: (entry: ContentEntry, dest: OutcomeDest | null) => void;
  textColor: string;
  borderColor: string;
}

function relativeTo(root: string, path: string): string {
  const r = root.replace(/\/+$/, '');
  if (path === r) return '';
  return path.startsWith(`${r}/`) ? path.slice(r.length + 1) : '';
}

function OutcomeDetail({ctx, entry, busy, onSetMove, textColor, borderColor}: Props & {entry: ContentEntry}): React.JSX.Element {
  const [location, setLocation] = useState<{root: string; folder: string} | null>(null);
  const areaFolder = ctx.areaFolder;
  const roots: FileBrowserRoot[] = [
    {key: 'area', label: 'Area Files', rootPath: areaFolder ?? ctx.paths.areas, disabled: !areaFolder},
    {key: 'resources', label: 'Resources', rootPath: ctx.paths.resources},
  ];
  const pending: OutcomeDest | null =
    location && (location.root === 'area' || location.root === 'resources')
      ? {root: location.root, subPath: relativeTo(location.root === 'area' ? areaFolder ?? '' : ctx.paths.resources, location.folder)}
      : null;

  return (
    <View style={co.fill}>
      <Text style={[co.strong, {color: textColor}]} numberOfLines={1}>
        {entry.title}
      </Text>
      <Text style={[co.small, {color: textColor}, co.mb8]}>
        {entry.movedTo ? `Moves to ${ctx.outcomeLabel(entry.movedTo)}/` : 'Stays in the archive with the project.'}
      </Text>
      <View style={co.wrapRow}>
        <PillButton label="Stays in archive" disabled={busy || !entry.movedTo} onPress={() => onSetMove(entry, null)} textColor={textColor} borderColor={borderColor} />
        <PillButton
          label={pending ? `Move here: ${ctx.outcomeLabel(pending)}` : 'Move here'}
          primary
          disabled={busy || !pending}
          onPress={() => pending && onSetMove(entry, pending)}
          textColor={textColor}
          borderColor={borderColor}
        />
      </View>
      {!areaFolder && <Text style={[co.small, co.muted, {color: textColor}]}>No Area assigned - Area Files is off (assign one in step 1).</Text>}
      <View style={[co.fill, co.mt6]}>
        <FileBrowserPane
          roots={roots}
          linkTarget={null}
          resetKey={entry.key}
          onActiveLocationChange={(rootKey, folderPath) => setLocation({root: rootKey, folder: folderPath})}
          textColor={textColor}
          borderColor={borderColor}
        />
      </View>
      <Text style={[co.small, co.muted, {color: textColor}]}>Nothing moves yet - all moves happen together in step 5. Links to the file are updated then.</Text>
    </View>
  );
}

export default function OutcomesStep(props: Props): React.JSX.Element {
  const {ctx, textColor, borderColor} = props;
  const rows = ctx.contents.outcomeCandidates;
  const moved = new Set(rows.filter(r => r.movedTo).map(r => r.key));
  return (
    <View style={co.fill}>
      <Text style={[co.body, {color: textColor}, co.mb6]}>What lives on after the project? Everything you don't move goes to the archive with the project folder.</Text>
      <View style={co.fill}>
        <ReviewMasterDetail<ContentEntry>
          header={`Files · ${moved.size} move`}
          rows={rows}
          rowHeight={() => ROW_H.outcome}
          isSelectable={() => true}
          rowKey={e => e.key}
          renderRow={(e, selected) => (
            <View style={[{height: ROW_H.outcome - 8}, co.center]}>
              <Text style={[co.body, {color: textColor}, selected && co.strong]} numberOfLines={1}>
                {e.title}
              </Text>
              <Text style={[co.small, {color: textColor}, e.movedTo ? co.strong : co.muted]} numberOfLines={1}>
                {e.movedTo ? `→ ${ctx.outcomeLabel(e.movedTo)}` : 'stays in archive'}
              </Text>
            </View>
          )}
          renderDetail={key => {
            const entry = rows.find(r => r.key === key);
            if (!entry) return <Text style={[co.body, co.muted, {color: textColor}]}>Tap a file on the left to choose where it goes.</Text>;
            return <OutcomeDetail {...props} entry={entry} />;
          }}
          actedOnKeys={moved}
          emptyHint="No files besides the project's own meeting and todo notes."
          textColor={textColor}
          borderColor={borderColor}
        />
      </View>
    </View>
  );
}
