/**
 * The page layout page (docs/dev/history/technical-design-note-setups.md
 * §6.3): left the page preview at real proportions with its MyStyle
 * background (tap a piece to select it); right Pieces · Add · Background,
 * the preview staying visible for all three. Done returns to the setup
 * page; the draft is kept until Save or Cancel there.
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {PAGE_KIND_LABELS} from '../../../domain/noteSetupText';
import {common} from '../../../ui/commonStyles';
import MiniTabs, {MiniTabDef} from '../../../ui/MiniTabs';
import NoteTemplatePreview from '../../../ui/NoteTemplatePreview';
import {styles} from '../settingsStyles';
import AddPiecePanel from './AddPiecePanel';
import BackgroundPanel from './BackgroundPanel';
import PiecesPanel from './PiecesPanel';
import {setupStyles} from './noteSetupsStyles';
import {LayoutPanel, NoteSetupDraft} from './useNoteSetupDraft';
import {MyStyleBackgrounds} from './useMyStylePngs';

const PANEL_TABS: MiniTabDef<LayoutPanel>[] = [
  {key: 'pieces', label: 'Pieces'},
  {key: 'add', label: 'Add'},
  {key: 'background', label: 'Background'},
];

export default function PageLayoutEditor(props: {
  draft: NoteSetupDraft;
  myStyle: MyStyleBackgrounds;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}): React.JSX.Element | null {
  const {draft, myStyle, textColor, borderColor, placeholderColor} = props;
  const target = draft.target;
  if (!target) return null;
  const owner = target.kind === 'default' ? 'Default' : target.setup.name.trim() || 'New note setup';
  const layout = draft.activeLayout;
  const panel = draft.layoutPanel;
  return (
    <View style={setupStyles.page}>
      <View style={setupStyles.headerRow}>
        <Pressable onPress={draft.handleLayoutDone} hitSlop={8}>
          <Text style={[setupStyles.headerBack, {color: textColor}]}>{`‹ ${owner}`}</Text>
        </Pressable>
        <Text style={[setupStyles.headerTitle, {color: textColor}]} numberOfLines={1}>
          {target.kind === 'setup' ? `${PAGE_KIND_LABELS[draft.activePage]} · Own layout` : PAGE_KIND_LABELS[draft.activePage]}
        </Text>
        {target.kind === 'setup' && (
          <Pressable onPress={() => draft.handleUseDefaultPage(draft.activePage)} hitSlop={8}>
            <Text style={[setupStyles.headerAction, {color: textColor}]}>Use default</Text>
          </Pressable>
        )}
        <Pressable style={[styles.saveButton, setupStyles.headerSave]} onPress={draft.handleLayoutDone}>
          <Text style={styles.saveButtonText}>Done</Text>
        </Pressable>
      </View>
      <View style={setupStyles.layoutColumns}>
        <View style={[common.column, common.columnLeft]}>
          <NoteTemplatePreview
            pieces={layout?.pieces ?? []}
            selectedIndex={draft.layout.selectedPieceIndex}
            onSelectPiece={index => {
              draft.layout.setSelectedPieceIndex(index);
              draft.setLayoutPanel('pieces');
            }}
            background={layout?.template ?? ''}
            textColor={textColor}
            borderColor={borderColor}
          />
        </View>
        <View style={common.column}>
          <MiniTabs tabs={PANEL_TABS} activeKey={panel} onChange={draft.setLayoutPanel} textColor={textColor} borderColor={borderColor} />
          {panel === 'pieces' && <PiecesPanel layout={layout} draft={draft.layout} textColor={textColor} borderColor={borderColor} />}
          {panel === 'add' && (
            <AddPiecePanel
              pageKind={draft.activePage}
              layout={layout}
              draft={draft.layout}
              textColor={textColor}
              borderColor={borderColor}
              placeholderColor={placeholderColor}
            />
          )}
          {panel === 'background' && <BackgroundPanel layout={layout} draft={draft.layout} myStyle={myStyle} textColor={textColor} borderColor={borderColor} />}
        </View>
      </View>
    </View>
  );
}
